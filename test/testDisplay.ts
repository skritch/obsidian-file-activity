import { signal } from "@preact/signals";
import { ReverseIndexEntry, DEFAULT_CONFIG, ReverseIndex, PluginConfig, LinkType} from "../src/data"
import { countlinksByDate, deriveDisplayEntries } from "../src/display"

describe("Display functions", () => {
  const now = Date.now()
  const msPerDay = 1000 * 60 * 60 * 24

  // Note: test will fail on a day boundary!
  describe("countlinksByDate", () => {
    test("Counts properly", () => {
      const entry: ReverseIndexEntry = {
        link: {path: "test.md", linkType: LinkType.RESOLVED},
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

  describe("deriveDisplayEntries", () => {
    test("Downweights links from older days", () => {
      const initialState: ReverseIndex = {
        "today.md": {
          link: {path: "today.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source.md": now}
        },
        "today2.md": {
          link: {path: "today2.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source.md": now, "source2.md": now}
        },
        "yesterday.md": {
          link: {path: "yesterday.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source3.md": now - msPerDay}
        }
      };
      
      const updateSignal = signal(0)
      const resultSignal = deriveDisplayEntries(initialState, updateSignal, signal(DEFAULT_CONFIG));
      updateSignal.value = 1 // Trigger an update
      const sortedNames = resultSignal.value.map((entry) => entry.link.linkType === LinkType.RESOLVED ? entry.link.path : "")
      expect(sortedNames).toEqual(["today2.md", "today.md", "yesterday.md"]);
    })


    test("Merges resolved and unresolved links", () => {
      const initialState: ReverseIndex = {
        "resolvedToday.md": {
          link: {path: "resolvedToday.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source.md": now, source2: now}
        },
        "resolvedYesterday.md": {
          link: {path: "resolvedYesterday.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source2.md": now - msPerDay}
        },
        "unresolvedToday": {
          link: {linkType: LinkType.UNRESOLVED, text: "unresolvedToday"},
          linksBySource: {"source.md": now}
        }
      };

      const updateSignal = signal(0)
      const resultSignal = deriveDisplayEntries(initialState, updateSignal, signal(DEFAULT_CONFIG));
      updateSignal.value = 1 // Trigger an update
      const sortedNames = resultSignal.value.map((entry) => entry.link.linkType === LinkType.RESOLVED ? entry.link.path : entry.link.text)
      expect(sortedNames).toEqual(["resolvedToday.md", "unresolvedToday", "resolvedYesterday.md"]);
    });

    test("Honors configuration", () => {
      const initialState: ReverseIndex = {
        "today.md": {
          link: {path: "today.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source.md": now,}
        },
        "yesterday": {
          link: {path: "yesterday.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source2.md": now-msPerDay}
        },
        // Omitted by maxLength
        "twoDaysAgo.md": {
          link: {path: "twoDaysAgo.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source.md": now - 2 * msPerDay}
        },
        // Would be first but omitted by TTL
        "earlier.md": {
          link: {path: "earlier.md", linkType: LinkType.RESOLVED},
          linksBySource: {"1.md": now - 10 * msPerDay, "2.md": now - 10 * msPerDay, "3.md": now - 10 * msPerDay}
        },
        // Directory is ignored
        "disallow/nope.md": {
          link: {path: "disallow/nope.md", linkType: LinkType.RESOLVED},
          linksBySource: {"source.md": now, "source2.md": now}
        }
      };

      const config: PluginConfig = {
        ...DEFAULT_CONFIG,
        displayDays: 3,
        displayCount: 2,
        disallowedPaths: ["^disallow/"],
      }

      const updateSignal = signal(0)
      const resultSignal = deriveDisplayEntries(initialState, updateSignal, signal(config));
      updateSignal.value = 1 // Trigger an update
      const sortedNames = resultSignal.value.map((entry) => entry.link.linkType === LinkType.RESOLVED ? entry.link.path : entry.link.text)
      expect(sortedNames).toEqual(["today.md", "yesterday.md"]);
    })
  })
});