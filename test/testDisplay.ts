import { countlinksByDate, ReverseIndexEntry, getDisplayLinks, DEFAULT_DATA, FileActivityPluginData} from "../src/data"


describe("Display functions", () => {
  let now = Date.now()
  let msPerDay = 1000 * 60 * 60 * 24

  // Note: test will fail on a day boundary!
  describe("countlinksByDate", () => {
    test("Counts properly", () => {
      let entry: ReverseIndexEntry = {
        text: "test",
        isResolved: true,
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

  describe("getDisplayLinks", () => {
    test("Downweights links from older days", () => {
      let initialdata: FileActivityPluginData = {
        ...DEFAULT_DATA(), 
        modTimes: {"source.md": now},
        reverseIndex: {
          "today.md": {
            text: "today",
            isResolved: true,
            linksBySource: {"source.md": now}
          },
          "today2.md": {
            text: "today2",
            isResolved: true,
            linksBySource: {"source.md": now, "source2.md": now}
          },
          "yesterday.md": {
            text: "yesterday",
            isResolved: true,
            linksBySource: {"source3.md": now - msPerDay}
          }
        }
      };

      let result = getDisplayLinks(initialdata);
      let names = result.map((entry) => entry.name);
      expect(names).toEqual(["today2", "today", "yesterday"]);
    })


    test("Merges resolved and unresolved links", () => {
      let initialdata: FileActivityPluginData = {
        ...DEFAULT_DATA(), 
        modTimes: {"source.md": now},
        reverseIndex: {
          "resolvedToday.md": {
            text: "resolvedToday",
            isResolved: true,
            linksBySource: {"source.md": now, source2: now}
          },
          "resolvedYesterday.md": {
            text: "resolvedYesterday",
            isResolved: true,
            linksBySource: {"source2.md": now - msPerDay}
          },
          "unresolvedToday": {
            text: "unresolvedToday",
            isResolved: false,
            linksBySource: {"source.md": now}
          }
        }
      };

      let result = getDisplayLinks(initialdata);
      let names = result.map((entry) => entry.name);
      expect(names).toEqual(["resolvedToday", "unresolvedToday", "resolvedYesterday"]);
    });

    test("Honors configuration", () => {
      let initialdata: FileActivityPluginData = {
        ...DEFAULT_DATA(),
        activityTTLdays: 3,
        maxLength: 2,
        disallowedPaths: ["^disallow/"],
        reverseIndex: {
          "today.md": {
            text: "today",
            isResolved: true,
            linksBySource: {"source.md": now,}
          },
          "yesterday": {
            text: "yesterday",
            isResolved: false,
            linksBySource: {"source2.md": now-msPerDay}
          },
          // Omitted by maxLength
          "twoDaysAgo.md": {
            text: "twoDaysAgo",
            isResolved: true,
            linksBySource: {"source.md": now - 2 * msPerDay}
          },
          // Would be first but omitted by TTL
          "earlier.md": {
            text: "yesterday",
            isResolved: true,
            linksBySource: {"1.md": now - 10 * msPerDay, "2.md": now - 10 * msPerDay, "3.md": now - 10 * msPerDay}
          },
          // Directory is ignored
          "disallow/nope.md": {
            text: "nope",
            isResolved: true,
            linksBySource: {"source.md": now, "source2.md": now}
          },
        }
      };

      let result = getDisplayLinks(initialdata);
      let names = result.map((entry) => entry.name);
      expect(names).toEqual(["today", "yesterday"]);
    })
  })
});