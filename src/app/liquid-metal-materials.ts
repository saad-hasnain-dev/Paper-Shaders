export const surfaceMaterialIds = [
  "liquidMetal",
  "wood",
  "warmWood",
  "liquid",
  "water",
  "glass",
  "sand",
  "ice",
  "gold",
  "marble",
] as const;

export type SurfaceMaterialId = (typeof surfaceMaterialIds)[number];

export const surfaceMaterialOptions: readonly {
  label: string;
  value: SurfaceMaterialId;
}[] = [
  { label: "Liquid Metal", value: "liquidMetal" },
  { label: "Wood", value: "wood" },
  { label: "Warm Wood", value: "warmWood" },
  { label: "Liquid", value: "liquid" },
  { label: "Water", value: "water" },
  { label: "Glass", value: "glass" },
  { label: "Sand", value: "sand" },
  { label: "Ice", value: "ice" },
  { label: "Gold", value: "gold" },
  { label: "Marble", value: "marble" },
];

export const DEFAULT_SURFACE_MATERIAL: SurfaceMaterialId = "liquidMetal";

export function asSurfaceMaterialId(value: unknown): SurfaceMaterialId {
  return surfaceMaterialIds.includes(value as SurfaceMaterialId)
    ? (value as SurfaceMaterialId)
    : DEFAULT_SURFACE_MATERIAL;
}

/** Shader index; 0 keeps the original Paper Liquid Metal surface. */
export function getSurfaceMaterialIndex(id: SurfaceMaterialId): number {
  return surfaceMaterialIds.indexOf(id);
}

export const surfaceMaterialFragmentPars = /* glsl */ `
  uniform float u_materialType;
  uniform float u_materialScale;
  uniform vec3 u_materialTint;
  uniform vec3 u_materialBackdrop;

  float lmHash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float lmNoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(lmHash13(i), lmHash13(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(lmHash13(i + vec3(0.0, 1.0, 0.0)), lmHash13(i + vec3(1.0, 1.0, 0.0)), u.x),
        u.y
      ),
      mix(
        mix(lmHash13(i + vec3(0.0, 0.0, 1.0)), lmHash13(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(lmHash13(i + vec3(0.0, 1.0, 1.0)), lmHash13(i + vec3(1.0, 1.0, 1.0)), u.x),
        u.y
      ),
      u.z
    );
  }

  float lmFbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * lmNoise3(p);
      p = p * 2.03 + vec3(17.1, 9.2, 3.7);
      amplitude *= 0.5;
    }
    return value;
  }

  // Returns nearest and second-nearest feature distances for crack edges.
  vec2 lmVoronoi(vec3 p) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    float first = 8.0;
    float second = 8.0;
    for (int z = -1; z <= 1; z++) {
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec3 offset = vec3(float(x), float(y), float(z));
          vec3 feature = vec3(
            lmHash13(cell + offset),
            lmHash13(cell + offset + 19.19),
            lmHash13(cell + offset + 47.73)
          );
          float distanceToFeature = length(offset + feature - local);
          if (distanceToFeature < first) {
            second = first;
            first = distanceToFeature;
          } else if (distanceToFeature < second) {
            second = distanceToFeature;
          }
        }
      }
    }
    return vec2(first, second);
  }

  // Circular travel keeps animated materials seamless across the timeline loop.
  vec3 lmLoopTravel(float phase, float radius) {
    float angle = 2.0 * LIQUID_PI * phase;
    return vec3(cos(angle), sin(angle), cos(angle) * 0.5) * radius;
  }

  vec3 lmSrgbToLinear(vec3 color) {
    return pow(color, vec3(2.2));
  }

  vec3 lmPalette(float t) {
    return 0.5 + 0.5 * cos(2.0 * LIQUID_PI * (t + vec3(0.0, 0.33, 0.67)));
  }

  vec3 lmSampleEnvironment(vec3 worldDirection, float roughness) {
    if (u_environmentDirect > 0.5) {
      float environmentCos = cos(u_environmentRotation);
      float environmentSin = sin(u_environmentRotation);
      vec3 direction = normalize(vec3(
        environmentCos * worldDirection.x + environmentSin * worldDirection.z,
        worldDirection.y,
        -environmentSin * worldDirection.x + environmentCos * worldDirection.z
      ));
      return texture2D(u_environmentMap, equirectUv(direction)).rgb
        * u_environmentIntensity;
    }
    #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
      return textureCubeUV(envMap, envMapRotation * worldDirection, roughness).rgb
        * envMapIntensity;
    #else
      return vec3(0.5);
    #endif
  }
`;

/*
 * Runs after the Liquid Metal surface block. Material 0 leaves Paper's result
 * untouched; every other material replaces albedo, metalness, roughness, and
 * adds its own object-space relief while keeping the scratch-mask normal.
 */
export const surfaceMaterialFragmentApply = /* glsl */ `
    float lmRefraction = 0.0;
    float lmIor = 1.5;
    vec3 lmTransmissionTint = vec3(1.0);
    float lmBackdropMix = 0.0;
    float lmCaustic = 0.0;
    int lmMaterial = int(u_materialType + 0.5);

    if (lmMaterial > 0) {
      vec3 lmPosition = vLiquidObjectPosition * u_materialScale;
      vec3 lmTravel = lmLoopTravel(phase, 0.55);
      vec3 lmAlbedo = vec3(0.8);
      float lmMetalness = 0.0;
      float lmRoughness = 0.5;
      float lmHeight = 0.0;
      float lmBump = 0.0;

      if (lmMaterial == 1 || lmMaterial == 2) {
        vec3 warped = lmPosition
          + (lmFbm(lmPosition * vec3(2.4, 0.7, 2.4)) - 0.5) * 0.35;
        float rings = length(warped.xz + vec2(0.37, -0.21)) * 9.0;
        float ring = fract(rings + lmFbm(lmPosition * vec3(4.0, 0.6, 4.0)) * 0.8);
        float lateWood = smoothstep(0.0, 0.18, ring)
          * (1.0 - smoothstep(0.55, 1.0, ring));
        float grain = lmNoise3(lmPosition * vec3(60.0, 4.0, 60.0));
        float fibers = lmNoise3(lmPosition * vec3(140.0, 10.0, 140.0));
        vec3 lightWood = lmMaterial == 1
          ? vec3(0.80, 0.63, 0.43)
          : vec3(0.82, 0.45, 0.22);
        vec3 darkWood = lmMaterial == 1
          ? vec3(0.47, 0.32, 0.19)
          : vec3(0.40, 0.15, 0.06);
        lmAlbedo = lmSrgbToLinear(
          mix(darkWood, lightWood, lateWood * 0.8 + 0.2 * grain)
            * (0.86 + 0.28 * fibers)
        );
        lmRoughness = lmMaterial == 1
          ? 0.62 - 0.12 * lateWood
          : 0.30 - 0.08 * lateWood;
        lmHeight = lateWood * 0.4 + grain * 0.3 + fibers * 0.3;
        lmBump = 0.3;
      } else if (lmMaterial == 3) {
        vec3 flowPosition = lmPosition * 1.6;
        vec3 warp = vec3(
          lmFbm(flowPosition + lmTravel),
          lmFbm(flowPosition + vec3(5.2, 1.3, 2.8) - lmTravel),
          lmFbm(flowPosition + vec3(2.1, 7.3, 4.4) + lmTravel.yzx)
        );
        float flow = lmFbm(flowPosition + 2.2 * warp);
        lmAlbedo = lmSrgbToLinear(lmPalette(flow * 1.6 + fresnelBase * 0.5 + 0.55));
        lmMetalness = 0.55;
        lmRoughness = 0.06;
        lmHeight = flow;
        lmBump = 0.35;
      } else if (lmMaterial == 4) {
        float swell = lmFbm(lmPosition * 3.0 + lmTravel);
        float chop = lmNoise3(lmPosition * 9.0 - lmTravel * 1.5);
        float causticNoise = lmNoise3(lmPosition * 5.0 + lmTravel * 1.3 + swell * 1.5);
        lmCaustic = pow(1.0 - abs(causticNoise * 2.0 - 1.0), 8.0);
        lmAlbedo = vec3(0.004, 0.03, 0.04);
        lmRoughness = 0.03;
        lmHeight = swell * 0.65 + chop * 0.35;
        lmBump = 1.1;
        lmRefraction = 1.0;
        lmIor = 1.33;
        lmBackdropMix = 0.55;
        lmTransmissionTint = vec3(0.45, 0.8, 0.9);
      } else if (lmMaterial == 5) {
        lmAlbedo = vec3(0.0);
        lmRoughness = 0.015;
        lmRefraction = 1.0;
        lmIor = 1.5;
        lmBackdropMix = 0.7;
        lmTransmissionTint = vec3(0.9, 0.97, 0.95);
      } else if (lmMaterial == 6) {
        float grain = lmNoise3(lmPosition * 180.0);
        float coarse = lmNoise3(lmPosition * 70.0);
        float ripples = sin(
          (lmPosition.x + lmPosition.z * 0.35) * 22.0
            + lmFbm(lmPosition * 2.0) * 6.0
        ) * 0.5 + 0.5;
        float speck = step(0.94, lmHash13(floor(lmPosition * 180.0)));
        vec3 sand = mix(
          vec3(0.76, 0.62, 0.42),
          vec3(0.93, 0.83, 0.64),
          ripples * 0.5 + coarse * 0.5
        ) * (0.85 + 0.3 * grain);
        lmAlbedo = lmSrgbToLinear(mix(sand, vec3(0.32, 0.26, 0.2), speck * 0.7));
        lmRoughness = 0.92;
        lmHeight = ripples * 0.5 + grain * 0.5;
        lmBump = 0.6;
      } else if (lmMaterial == 7) {
        vec2 cells = lmVoronoi(lmPosition * 2.5);
        float crack = 1.0 - smoothstep(0.0, 0.06, cells.y - cells.x);
        float frost = lmFbm(lmPosition * 8.0);
        float haze = clamp(crack * 0.7 + frost * frost * 0.35, 0.0, 1.0);
        lmAlbedo = mix(vec3(0.01, 0.025, 0.035), vec3(0.72, 0.84, 0.95), haze);
        lmRoughness = 0.06 + 0.35 * frost * frost + 0.2 * crack;
        lmHeight = frost * 0.5 - crack * 0.6;
        lmBump = 0.35;
        lmRefraction = 1.0 - crack * 0.6;
        lmIor = 1.31;
        lmBackdropMix = 0.5;
        lmTransmissionTint = vec3(0.68, 0.87, 1.0);
      } else if (lmMaterial == 8) {
        float brushed = lmNoise3(lmPosition * vec3(220.0, 3.0, 220.0));
        lmAlbedo = vec3(1.0, 0.71, 0.29);
        lmMetalness = 1.0;
        lmRoughness = 0.1 + 0.07 * brushed;
        lmHeight = brushed;
        lmBump = 0.04;
      } else if (lmMaterial == 9) {
        float veinPath = lmPosition.x * 2.0 + lmPosition.y * 1.2
          + lmFbm(lmPosition * 1.8) * 5.0;
        float vein = pow(1.0 - abs(sin(veinPath * 1.4)), 12.0);
        float fineVein = pow(
          1.0 - abs(sin(lmPosition.z * 3.0 + lmFbm(lmPosition * 4.0 + 3.0) * 6.0)),
          30.0
        ) * 0.5;
        float cloud = lmFbm(lmPosition * 6.0);
        lmAlbedo = lmSrgbToLinear(
          mix(
            vec3(0.94, 0.93, 0.90),
            vec3(0.28, 0.28, 0.30),
            clamp(vein + fineVein, 0.0, 1.0)
          ) * (0.93 + 0.07 * cloud)
        );
        lmRoughness = 0.12;
      }

      if (lmBump > 0.0) {
        vec2 lmDerivatives = lmBump * vec2(dFdx(lmHeight), dFdy(lmHeight));
        normal = perturbScratchNormalArb(
          -vViewPosition,
          normal,
          lmDerivatives,
          faceDirection
        );
      }

      diffuseColor.rgb = lmAlbedo * u_materialTint;
      lmTransmissionTint *= u_materialTint;
      metalnessFactor = lmMetalness;
      roughnessFactor = clamp(lmRoughness, 0.01, 1.0);
    }
`;

/*
 * Runs after environment lighting. Clear materials add environment light seen
 * through the surface, weighted by the dielectric Fresnel transmission term.
 */
export const surfaceMaterialLightsApply = /* glsl */ `
    if (lmRefraction > 0.001) {
      vec3 lmWorldNormal = inverseTransformDirection(geometryNormal, viewMatrix);
      vec3 lmWorldView = inverseTransformDirection(geometryViewDir, viewMatrix);
      float lmEta = 1.0 / lmIor;
      vec3 lmThrough = -lmWorldView;
      vec3 lmRefractRed = refract(lmThrough, lmWorldNormal, lmEta * 0.985);
      vec3 lmRefractGreen = refract(lmThrough, lmWorldNormal, lmEta);
      vec3 lmRefractBlue = refract(lmThrough, lmWorldNormal, lmEta * 1.015);
      float lmRefractRoughness = material.roughness;
      // Exaggerated bend stands in for the second (exit) surface.
      vec3 lmTransmitted = vec3(
        lmSampleEnvironment(normalize(lmRefractRed * 2.5 - lmThrough * 1.5), lmRefractRoughness).r,
        lmSampleEnvironment(normalize(lmRefractGreen * 2.5 - lmThrough * 1.5), lmRefractRoughness).g,
        lmSampleEnvironment(normalize(lmRefractBlue * 2.5 - lmThrough * 1.5), lmRefractRoughness).b
      );
      float lmCosine = clamp(dot(lmWorldNormal, lmWorldView), 0.0, 1.0);
      float lmFresnel = 0.04 + 0.96 * pow(1.0 - lmCosine, 5.0);
      // What sits behind the object: the canvas backdrop, lit by the environment.
      lmTransmitted = mix(lmTransmitted, u_materialBackdrop, lmBackdropMix);
      // Grazing views travel through more material, so edges absorb and tint.
      float lmThickness = 1.0 / max(lmCosine, 0.2);
      vec3 lmAbsorption = exp(-(1.0 - lmTransmissionTint) * lmThickness * 1.4);
      lmTransmitted *= lmAbsorption * mix(1.0, 0.45, pow(1.0 - lmCosine, 2.0));
      lmTransmitted += lmCaustic * 0.55 * lmTransmissionTint;
      vec3 lmReflected = lmSampleEnvironment(
        reflect(-lmWorldView, lmWorldNormal),
        lmRefractRoughness
      );
      totalEmissiveRadiance += lmTransmitted * lmRefraction * (1.0 - lmFresnel)
        + lmReflected * (0.08 + 0.9 * pow(1.0 - lmCosine, 3.0)) * lmRefraction;
    }
`;
