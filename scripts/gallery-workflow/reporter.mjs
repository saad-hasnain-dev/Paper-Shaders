import fs from "node:fs";
import path from "node:path";

export default class GalleryFeatureReporter {
  tests = [];
  onTestEnd(test, result) {
    let owner = test.parent;
    while (owner && owner.type !== "file") owner = owner.parent;
    this.tests.push({
      file: path.relative(process.cwd(), owner?.location?.file ?? test.location.file).split(path.sep).join("/"),
      testName: test.title, status: result.status, retry: result.retry,
      expectedStatus: test.expectedStatus,
    });
  }
  onEnd(result) {
    fs.writeFileSync(process.env.TOOLCRAFT_GALLERY_RESULT, JSON.stringify({ status: result.status, tests: this.tests }));
  }
}
