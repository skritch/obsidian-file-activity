import { DEFAULT_DATA, FileActivityPluginData, deletePath, renamePath, updateOutgoingLinks } from "../src/data"


describe("File Activity Plugin", () => {
  const TIME_T = 1692055220000
  const initialBacklinks = () => {
    return {
      "target.md": {
        path: "target.md",
        name: "target",
        linksBySource: {"source.md": TIME_T}
      }
    }
  }
  const initialData = (): FileActivityPluginData => {
    return {
      ...DEFAULT_DATA(), 
      modTimes: {"source.md": TIME_T},
      backlinkIndex: initialBacklinks()
    }
  };


  describe("updateOutgoingLinks", () => {
    test("Handles adding a link a file", () => {
      let data = initialData()
      const finalData: FileActivityPluginData = {
        ...initialData(),
        backlinkIndex: {
          "target.md": {
            path: "target.md",
            name: "target",
            linksBySource: {"otherSource.md": 1692055220001, "source.md": 1692055220000}
          },
          "otherTarget.md": {
            path: "otherTarget.md",
            name: "otherTarget",
            linksBySource: {"otherSource.md": 1692055220001}
          }
        },
        modTimes: {"source.md": 1692055220000, "otherSource.md": 1692055220001}
      };
  
      // Sequence fired when adding a link to a file
      updateOutgoingLinks("otherSource.md", 1692055220001, ["target.md", "otherTarget.md"], data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing a link from a file", () => {
      let data = initialData()
      const finalData: FileActivityPluginData = {
        ...initialData(),
        modTimes: {"source.md": TIME_T + 2}
      };
      finalData['backlinkIndex']['target.md']['linksBySource']['source.md'] = TIME_T +2 
  
      // Sequence fired when adding a link to a file and then removing it
      updateOutgoingLinks("source.md", TIME_T + 1, ["target.md", "otherTarget.md"], data);
      updateOutgoingLinks("source.md", TIME_T + 2, ["target.md"], data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing the last link to a file", () => {
      let data = initialData()
      const finalData: FileActivityPluginData = {
        ...initialData(),
        backlinkIndex: {},
        modTimes: {"source.md": TIME_T + 1}
      };
  
      // Sequence fired when adding a link to a file and then removing it
      updateOutgoingLinks("source.md", TIME_T + 1, [], data);
      
      expect(data).toEqual(finalData);
    });

    test("Ignores out-of-order events", () => {
      let data = initialData()
      updateOutgoingLinks("source.md", TIME_T -1 , ['other.md'], data);
      
      expect(data).toEqual(initialData());
    })
  })


  describe("handleRename", () => {
    test("Handles renaming a file with both incoming and outgoing links", () => {
      let data = {
        ...initialData(),
        backlinkIndex: {
          ...initialBacklinks,
          "other.md": {
            path: "other.md",
            name: "other",
            linksBySource: {"target.md": TIME_T}
          }
        }
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        backlinkIndex: {
          "newTarget.md": {
            path: "newTarget.md",
            name: "newTarget",
            linksBySource: {"source.md": TIME_T + 3}
          },
          "other.md": {
            path: "other.md",
            name: "other",
            linksBySource: {"newTarget.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T + 3, "newTarget.md": TIME_T + 1}
      };
  
      // Obsidian removes the old link, then renames, then adds the new link.
      updateOutgoingLinks("source.md", TIME_T + 2, [], data);
      renamePath("newTarget.md", "target.md", TIME_T + 1, ["other.md"], data); // Note earlier time--seems to happen in a weird order.
      updateOutgoingLinks("source.md", TIME_T + 3, ["newTarget.md"], data);
      
      expect(data).toEqual(finalData);
    });

    test("Handles moving a file without changing its name", () => {
      let data = {
        ...initialData(),
        backlinkIndex: {
          ...initialBacklinks,
          "other.md": {
            path: "other.md",
            name: "other",
            linksBySource: {"target.md": TIME_T}
          }
        }
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        backlinkIndex: {
          "dir/target.md": {
            path: "dir/target.md",
            name: "target",
            linksBySource: {"source.md": TIME_T + 2}
          },
          "other.md": {
            path: "other.md",
            name: "other",
            linksBySource: {"dir/target.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T + 2, "dir/target.md": TIME_T + 1}
      };
  
      // Resolve for inbound links fires first.
      updateOutgoingLinks("source.md", TIME_T + 2, ["dir/target.md"], data);
      renamePath("dir/target.md", "target.md", TIME_T + 1, ["other.md"], data);
      
      expect(data).toEqual(finalData);

    });

    // TODOs (maybe)
    // handle case where the resolve for the new name happens before the rename from the old
    // handle unresolved links that are now resolved (this WILL resolve the file with the previously-unresolved link)
    // corner case: rename to/from a markdown name. Don't think you can?
    // corner case: fires for directories, probably for other non-MD files
  })
  
  describe("handleDelete", () => {
    test("Handles deleting a file with incoming and outgoing links", () => {
      let data: FileActivityPluginData = {
        ...initialData(),
        backlinkIndex: {
          ...initialBacklinks,
          "other.md": {
            path: "other.md",
            name: "other",
            linksBySource: {"source.md": TIME_T, "target.md": TIME_T}
          }
        },
        modTimes: {"source.md": TIME_T, "target.md": TIME_T}
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        backlinkIndex: {
          "other.md": {
            path: "other.md",
            name: "other",
            linksBySource: {"source.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T + 1}
      };
  
      // Obsidian deletes the file, and fires separate events to unresolve incoming links.
      deletePath("target.md", data)
      updateOutgoingLinks("source.md", TIME_T + 1, ["other.md"], data);
      
      expect(data).toEqual(finalData);
    });
  });

  /**
   * Cases to test:
   *  app start
   *  - multiple resolves
   *  - resolved
   * 
   *  plugin enable (first time)
   *  - what happens?
   * 
   *  plugin disable + enable
   */
});
