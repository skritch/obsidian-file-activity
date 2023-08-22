import { countlinksByDate, ReverseIndexEntry, getDisplayLinks, DEFAULT_DATA, PluginState} from "../src/data"


describe("Display functions", () => {
  const now = Date.now()
  const msPerDay = 1000 * 60 * 60 * 24

  // Note: test will fail on a day boundary!
  describe("countlinksByDate", () => {
    test("Counts properly", () => {
      const entry: ReverseIndexEntry = {
        text: "test",
        isResolved: true,
        linksBySource: {
          "a": now,
          "b": now - msPerDay,
          "c": now - msPerDay * 3,
          "d": now - msPerDay * 3
        }
      };
      const result = countlinksByDate(entry, 5);
      expect(result).toEqual([0, 2, 0, 1, 1])
    });
  });

  describe("getDisplayLinks", () => {
    test("Downweights links from older days", () => {
      const initialState: PluginState = {
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

      const result = getDisplayLinks({state: initialState, config: DEFAULT_DATA().config});
      const names = result.map((entry) => entry.name);
      expect(names).toEqual(["today2", "today", "yesterday"]);
    })


    test("Merges resolved and unresolved links", () => {
      const initialState: PluginState = {
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

      const result = getDisplayLinks({state: initialState, config: DEFAULT_DATA().config});
      const names = result.map((entry) => entry.name);
      expect(names).toEqual(["resolvedToday", "unresolvedToday", "resolvedYesterday"]);
    });

    test("Honors configuration", () => {
      const initialState: PluginState = {
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

      const config = {
        ...DEFAULT_DATA().config,
        activityTTLdays: 3,
        maxLength: 2,
        disallowedPaths: ["^disallow/"],
      }

      const result = getDisplayLinks({state: initialState, config: config});
      const names = result.map((entry) => entry.name);
      expect(names).toEqual(["today", "yesterday"]);
    })
  })
});