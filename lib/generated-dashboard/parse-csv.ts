import Papa from "papaparse";

// CSV -> rows for the Generate Custom Dashboard upload branch. Split out of
// the dialog so the parse step is one thing with one error contract: every
// failure mode arrives as an Error carrying a message that's already fit to
// show the user, naming the file that failed.

export function parseCsvFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const fatal = result.errors.find(
          (e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter"
        );
        if (fatal) {
          reject(new Error(`Could not parse "${file.name}": ${fatal.message}`));
          return;
        }
        if (result.data.length === 0) {
          reject(new Error(`"${file.name}" contains no data rows.`));
          return;
        }
        resolve(result.data);
      },
      error: (err) => reject(new Error(`Could not read "${file.name}": ${err.message}`)),
    });
  });
}
