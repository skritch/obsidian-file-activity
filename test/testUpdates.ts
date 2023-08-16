import { DEFAULT_DATA, FileActivityPluginData, remove, rename, update } from "../src/data"


describe("File Activity Plugin", () => {
  const TIME_T = 1692055220000
  
  const initialData = (): FileActivityPluginData => {
    return {
      ...DEFAULT_DATA(), 
      modTimes: {"source.md": TIME_T},
      linkIndex: {
        "target.md": {
          name: "target",
          linksBySource: {"source.md": TIME_T}
        }
      }
    }
  };


  describe("update", () => {
    test("Handles adding links a file", () => {
      let data = {
        ...initialData(),
        unresolvedLinkIndex: {
          "unresolved": {
            name: "unresolved",
            linksBySource: {"source.md": TIME_T}
          },
        }
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {
          "target.md": {
            name: "target",
            linksBySource: {"otherSource.md": TIME_T + 1, "source.md": TIME_T}
          },
          "otherTarget.md": {
            name: "otherTarget",
            linksBySource: {"otherSource.md": TIME_T + 1}
          }
        },
        unresolvedLinkIndex: {
          "unresolved": {
            name: "unresolved",
            linksBySource: {"otherSource.md": TIME_T + 1, "source.md": TIME_T}
          },
          "anotherUnresolved": {
            name: "anotherUnresolved",
            linksBySource: {"otherSource.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T, "otherSource.md": TIME_T + 1}
      };
  
      // Sequence fired when adding a link to a file
      update("otherSource.md", TIME_T + 1, ["target.md", "otherTarget.md"], ["unresolved", "anotherUnresolved"], data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing links from a file", () => {
      let data = {
        ...initialData(),
        linkIndex: {
          "target.md": {
            name: "target",
            linksBySource: {"source.md": TIME_T}
          },
          "otherTarget.md": {
            name: "otherTarget",
            linksBySource: {"source.md": TIME_T}
          }
        },
        unresolvedLinkIndex: {
          "unresolved": {
            name: "unresolved",
            linksBySource: {"source.md": TIME_T}
          },
          "anotherUnresolved": {
            name: "anotherUnresolved",
            linksBySource: {"source.md": TIME_T}
          }
        }
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        
        linkIndex: {
          "target.md": {
            name: "target",
            linksBySource: {"source.md": TIME_T + 1}
          }
        },
        unresolvedLinkIndex: {
          "unresolved": {
            name: "unresolved",
            linksBySource: {"source.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T + 1}
      };
  
      // Sequence fired when adding a link to a file and then removing it
      update("source.md", TIME_T + 1, ["target.md"], ["unresolved"], data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing the last link to a file", () => {
      let data = {
        ...initialData(),
        unresolvedLinkIndex: {
          "unresolved": {
            name: "unresolved",
            linksBySource: {"source.md": TIME_T}
          }
        }
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {},
        unresolvedLinkIndex: {},
        modTimes: {"source.md": TIME_T + 1}
      };
  
      // Sequence fired when adding a link to a file and then removing it
      update("source.md", TIME_T + 1, [], [], data);
      
      expect(data).toEqual(finalData);
    });

    test("Ignores out-of-order events", () => {
      let data = initialData()
      update("source.md", TIME_T - 1 , ['other.md'], ['another'], data);
      
      expect(data).toEqual(initialData());
    })
  })


  describe("rename", () => {
    test("Handles renaming a file with both incoming and outgoing links", () => {
      let data: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {
          ...initialData().linkIndex,
          "other.md": {
            name: "other",
            linksBySource: {"target.md": TIME_T}
          }
        },
        unresolvedLinkIndex: {
          "other": {
            name: "other",
            linksBySource: {"target.md": TIME_T}
          }
        }
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {
          "newTarget.md": {
            name: "newTarget",
            linksBySource: {"source.md": TIME_T + 3}
          },
          "other.md": {
            name: "other",
            linksBySource: {"newTarget.md": TIME_T + 1}
          }
        },
        unresolvedLinkIndex: {
          "other": {
            name: "other",
            linksBySource: {"newTarget.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T + 3, "newTarget.md": TIME_T + 1}
      };
  
      // Obsidian removes the old link, then renames, then adds the new link.
      update("source.md", TIME_T + 2, [], [], data);
      // Note earlier time--seems to happen in a weird order, but shouldn't make a difference.
      rename("newTarget.md", "target.md", TIME_T + 1, ["other.md"], ["other"], data); 
      update("source.md", TIME_T + 3, ["newTarget.md"], [], data);
      
      expect(data).toEqual(finalData);
    });

    test("Handles moving a file without changing its name", () => {
      let data: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {
          ...initialData()['linkIndex'],
          "other.md": {
            name: "other",
            linksBySource: {"target.md": TIME_T}
          }
        }
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {
          "dir/target.md": {
            name: "target",
            linksBySource: {"source.md": TIME_T + 2}
          },
          "other.md": {
            name: "other",
            linksBySource: {"dir/target.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T + 2, "dir/target.md": TIME_T + 1}
      };
  
      // Resolve for inbound links fires first.
      update("source.md", TIME_T + 2, ["dir/target.md"], [], data);
      rename("dir/target.md", "target.md", TIME_T + 1, ["other.md"], [], data);
      
      expect(data).toEqual(finalData);

    });
    // corner case? handle rename to same name as an existing file but at a new path
  })
  
  describe("delete", () => {
    test("Handles deleting a file with incoming and outgoing links", () => {
      let data: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {
          ...initialData().linkIndex,
          "other.md": {
            name: "other",
            linksBySource: {"source.md": TIME_T, "target.md": TIME_T}
          }
        },
        unresolvedLinkIndex: {
          "other": {
            name: "other",
            linksBySource: {"target.md": TIME_T}
          }
        },
        modTimes: {"source.md": TIME_T, "target.md": TIME_T}
      }
      const finalData: FileActivityPluginData = {
        ...initialData(),
        linkIndex: {
          "other.md": {
            name: "other",
            linksBySource: {"source.md": TIME_T + 1}
          }
        },
        unresolvedLinkIndex: {
          "target": {
            name: "target",
            linksBySource: {"source.md": TIME_T + 1}
          }
        },
        modTimes: {"source.md": TIME_T + 1}
      };
  
      // Obsidian deletes the file, and fires separate events to unresolve incoming links.
      remove("target.md", data)
      update("source.md", TIME_T + 1, ["other.md"], ["target"], data);
      
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
