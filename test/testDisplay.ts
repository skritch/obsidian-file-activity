import { countlinksByDate, IndexEntry, getDisplayLinks, DEFAULT_DATA} from "../src/data"


describe("Display functions", () => {
  let now = Date.now()
  let msPerDay = 1000 * 60 * 60 * 24

  // Note: test will fail on a day boundary!
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

  describe("getDisplayLinks", () => {
    test("Downweights links from older days", () => {
      let initialdata = {
        ...DEFAULT_DATA(), 
        modTimes: {"source.md": now},
        linkIndex: {
          "today.md": {
            name: "today",
            linksBySource: {"source.md": now}
          },
          "today2.md": {
            name: "today2",
            linksBySource: {"source.md": now, "source2.md": now}
          },
          "yesterday.md": {
            name: "yesterday",
            linksBySource: {"source3.md": now - msPerDay}
          }
        }
      };

      let result = getDisplayLinks(initialdata);
      let names = result.map((entry) => entry.name);
      expect(names).toEqual(["today2", "today", "yesterday"]);
    })


    test("Merges resolved and unresolved links", () => {
      let initialdata = {
        ...DEFAULT_DATA(), 
        modTimes: {"source.md": now},
        linkIndex: {
          "resolvedToday.md": {
            name: "resolvedToday",
            linksBySource: {"source.md": now, source2: now}
          },
          "resolvedYesterday.md": {
            name: "resolvedYesterday",
            linksBySource: {"source2.md": now - msPerDay}
          }
        },
        unresolvedLinkIndex: {
          "unresolvedToday": {
            name: "unresolvedToday",
            linksBySource: {"source.md": now}
          }
        }
      };

      let result = getDisplayLinks(initialdata);
      let names = result.map((entry) => entry.name);
      expect(names).toEqual(["resolvedToday", "unresolvedToday", "resolvedYesterday"]);
    });

    test("Honors configuration", () => {
      let initialdata = {
        ...DEFAULT_DATA(),
        activityTTLDays: 3,
        maxLength: 2,
        disallowedPaths: ["^disallow/"],
        linkIndex: {
          "today.md": {
            name: "today",
            linksBySource: {"source.md": now,}
          },
          "yesterday.md": {
            name: "yesterday",
            linksBySource: {"source2.md": now-msPerDay}
          },
          // Omitted by maxLength
          "twoDaysAgo.md": {
            name: "twoDaysAgo",
            linksBySource: {"source.md": now - 2 * msPerDay}
          },
          // Would be first but omitted by TTL
          "earlier.md": {
            name: "yesterday",
            linksBySource: {"1.md": now - 10 * msPerDay, "2.md": now - 10 * msPerDay, "3.md": now - 10 * msPerDay}
          },
          // Directory is ignored
          "disallow/nope.md": {
            name: "nope",
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