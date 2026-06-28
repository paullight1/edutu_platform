import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  "/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/outputs/019eec07-855c-7451-9bd1-f7d3d04576e9/edutu_quality_canonical.xlsx";

const blob = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(blob);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 8000,
  tableMaxRows: 5,
  tableMaxCols: 8,
  tableMaxCellChars: 80,
});

console.log(summary.ndjson);
