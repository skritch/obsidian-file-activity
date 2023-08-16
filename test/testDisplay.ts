import { countlinksByDate, IndexEntry } from "../src/data"


describe("Display functions", () => {
  let now = Date.now()
  let msPerDay = 1000 * 60 * 60 * 24

  // Note: test will fial on a day boundary!
  describe("countlinksByDate", () => {
    test("Counts properly", () => {
      let entry: IndexEntry = {
        name: "test",
        linksBySource: {
          "a": now,
          "b": now - msPerDay,
          "c": now - msPerDay * 3,
          "d": now - msPerDay * 3
        }
      };
      let result = countlinksByDate(entry, 5);
      expect(result).toEqual([1, 1, 0, 2, 0])
    });
  });
});