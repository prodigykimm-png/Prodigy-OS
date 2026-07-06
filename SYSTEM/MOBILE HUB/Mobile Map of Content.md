
```datacorejsx
////////////////////////////////////////////////////
///             Initial Settings                 ///
////////////////////////////////////////////////////

const initialSettings = {
  vaultName: "Dusk", // Replace with your actual vault name
  queryPath: "",
  initialNameFilter: "",
  dynamicColumnProperties: {
    "File Name": "name.obsidian",
    "File Type": "type",
    "Last Modified": "mtime.obsidian",
    //"Creation Date": "ctime.obsidian",
    //"Tags": "tags",
  },
  groupByColumns: [],
  pagination: {
    isEnabled: true,
    itemsPerPage: 4,
  },
  viewHeight: "600px",
  placeholders: {
    nameFilter: "Search notes...",
    queryPath: "Enter path...",
    headerTitle: "Map of Content",
    newHeaderLabel: "New Header Label",
    newDataField: "New Data Field",
  },
  excludedFolders: ["SYSTEM", "HUB", "DAILY"], // Add folders to exclude here, e.g. ["Personal", "Archive"]
};

////////////////////////////////////////////////////
///               Helper Functions               ///
////////////////////////////////////////////////////


const { useState, useMemo, useEffect } = dc; // Assuming 'dc' is the Dataview context

function getProperty(entry, property) {
  if (property.endsWith(".obsidian")) {
    const key = property.replace(".obsidian", "");
    const obsidianProps = {
      ctime: entry.$ctime?.toISODate() || "Unknown Date",
      mtime: entry.$mtime?.toISODate() || "Unknown Last Modified Date",
      name: entry.$name || "Unnamed",
    };
    return obsidianProps[key] || "No Data";
  }

  const frontmatterField = entry.$frontmatter?.[property];
  if (frontmatterField !== undefined) {
    if (
      frontmatterField &&
      typeof frontmatterField === "object" &&
      frontmatterField.hasOwnProperty("value")
    ) {
      const value = frontmatterField.value;
      if (Array.isArray(value)) {
        return value.join(", ");
      } else if (value !== null && value !== undefined) {
        return value.toString();
      }
    } else if (Array.isArray(frontmatterField)) {
      return frontmatterField.join(", ");
    } else if (
      typeof frontmatterField === "string" ||
      typeof frontmatterField === "number"
    ) {
      return frontmatterField.toString();
    } else if (frontmatterField !== null && frontmatterField !== undefined) {
      return frontmatterField.toString();
    }
  }

  return " ";
}

////////////////////////////////////////////////////
///                 Components                   ///
////////////////////////////////////////////////////

function DraggableLink({ entry, title }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData("text/plain", `[[${title}]]`);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <a
      href="#"
      className="internal-link"
      draggable
      onDragStart={handleDragStart}
      data-href={entry.$path || title}
      data-type="file"
      title={`Drag to copy [[${title}]]`}
      style={styles.draggableLink}
    >
      {title}
    </a>
  );
}

function EditableCell({ entry, property, onUpdate }) {
  const [value, setValue] = useState(getProperty(entry, property));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setValue(getProperty(entry, property));
  }, [entry, property]);

  const handleBlur = () => {
    setIsEditing(false);
    onUpdate(entry, property, value);
  };

  return isEditing ? (
    <dc.Textbox
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      autoFocus
      style={styles.cellTextbox}
    />
  ) : (
    <div
      style={styles.tableCellContent}
      onClick={() => setIsEditing(true)}
      title="Click to edit"
    >
      {value}
    </div>
  );
}

function EditableHeader({ columnId, editedHeaders, setEditedHeaders }) {
  const [isEditing, setIsEditing] = useState(false);
  const [headerValue, setHeaderValue] = useState(
    editedHeaders[columnId] || columnId
  );

  const handleBlur = () => {
    const trimmedValue = headerValue.trim();
    if (trimmedValue === "") {
      alert("Header name cannot be empty.");
      setHeaderValue(editedHeaders[columnId] || columnId);
    } else {
      setIsEditing(false);
      setEditedHeaders((prev) => ({
        ...prev,
        [columnId]: trimmedValue,
      }));
    }
  };

  return isEditing ? (
    <dc.Textbox
      value={headerValue}
      onChange={(e) => setHeaderValue(e.target.value)}
      onBlur={handleBlur}
      autoFocus
      placeholder="Edit header..."
      style={styles.headerTextbox}
    />
  ) : (
    <label
      style={styles.editBlockHeader}
      onClick={() => setIsEditing(true)}
      title="Click to edit header"
    >
      {headerValue}
    </label>
  );
}

function EditColumnBlock(props) {
  const {
    columnId,
    index,
    columnsToShow,
    setColumnsToShow,
    editedHeaders,
    setEditedHeaders,
    editedFields,
    setEditedFields,
    updateColumn,
    removeColumn,
    dynamicColumnProperties,
    groupByColumns,
    setGroupByColumns,
    groupSortOrders,
    setGroupSortOrders,
  } = props;

  const isGrouped = groupByColumns.includes(columnId);
  const groupIndex = groupByColumns.indexOf(columnId) + 1;
  const sortOrder = groupSortOrders[columnId] || "asc";

  const handleDragStart = (e) => {
    e.dataTransfer.setData("dragIndex", index);
  };

  const handleDrop = (e) => {
    const dragIndex = e.dataTransfer.getData("dragIndex");
    if (dragIndex === "") return;
    const parsedDragIndex = parseInt(dragIndex, 10);
    if (isNaN(parsedDragIndex)) return;
    const newColumns = [...columnsToShow];
    const draggedColumn = newColumns[parsedDragIndex];
    newColumns.splice(parsedDragIndex, 1);
    newColumns.splice(index, 0, draggedColumn);
    setColumnsToShow(newColumns);
  };

  const toggleSortOrder = () => {
    const newSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setGroupSortOrders({
      ...groupSortOrders,
      [columnId]: newSortOrder,
    });
  };

  const handleDataFieldChange = (e) => {
    const newField = e.target.value;
    setEditedFields((prev) => ({
      ...prev,
      [columnId]: newField,
    }));
  };

  const handleDataFieldUpdate = () => {
    const newField =
      editedFields[columnId] || dynamicColumnProperties[columnId];
    updateColumn(columnId, editedHeaders[columnId] || columnId, newField);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      style={styles.editBlock}
    >
      <div style={styles.editBlockHeaderContainer}>
        <EditableHeader
          columnId={columnId}
          editedHeaders={editedHeaders}
          setEditedHeaders={setEditedHeaders}
        />
      </div>
      <div style={styles.inlineButtonGroup}>
        <button
          onClick={handleDataFieldUpdate}
          style={styles.inlineButton}
        >
          Update
        </button>
        <button
          onClick={() => removeColumn(columnId)}
          style={styles.inlineButton}
        >
          Remove
        </button>
        <button
          onClick={() =>
            setGroupByColumns(
              isGrouped
                ? groupByColumns.filter((col) => col !== columnId)
                : [...groupByColumns, columnId]
            )
          }
          style={{
            ...styles.inlineButton,
            backgroundColor: isGrouped 
              ? "var(--background-modifier-border)"
              : "var(--interactive-accent)",
            color: isGrouped
              ? "var(--text-normal)"
              : "var(--text-on-accent)",
          }}
          data-active={isGrouped}
        >
          {isGrouped ? "Ungroup" : "Group By"}
        </button>
      </div>
      {isGrouped && (
        <div style={styles.groupOrderControls}>
          <span style={styles.groupOrderLabel}>Group Order: {groupIndex}</span>
          <div style={styles.groupButtons}>
            <button
              onClick={() =>
                setGroupByColumns((prev) => {
                  const idx = prev.indexOf(columnId);
                  if (idx > 0) {
                    const newGroup = [...prev];
                    [newGroup[idx - 1], newGroup[idx]] = [
                      newGroup[idx],
                      newGroup[idx - 1],
                    ];
                    return newGroup;
                  }
                  return prev;
                })
              }
              disabled={groupByColumns.indexOf(columnId) === 0}
              style={styles.buttonSmall}
            >
              ↑
            </button>
            <button
              onClick={() =>
                setGroupByColumns((prev) => {
                  const idx = prev.indexOf(columnId);
                  if (idx < prev.length - 1) {
                    const newGroup = [...prev];
                    [newGroup[idx], newGroup[idx + 1]] = [
                      newGroup[idx + 1],
                      newGroup[idx],
                    ];
                    return newGroup;
                  }
                  return prev;
                })
              }
              disabled={
                groupByColumns.indexOf(columnId) === groupByColumns.length - 1
              }
              style={styles.buttonSmall}
            >
              ↓
            </button>
            <button onClick={toggleSortOrder} style={styles.buttonSmall}>
              {sortOrder === "asc" ? "Asc" : "Desc"}
            </button>
          </div>
        </div>
      )}
      <div style={styles.dataFieldContainer}>
        <dc.Textbox
          value={editedFields[columnId] || dynamicColumnProperties[columnId]}
          onChange={handleDataFieldChange}
          placeholder="Data Field..."
          style={styles.dataFieldTextbox}
          onBlur={handleDataFieldUpdate}
          autoFocus={false}
        />
      </div>
    </div>
  );
}

function AddColumn({
  newHeaderLabel,
  setNewHeaderLabel,
  newFieldLabel,
  setNewFieldLabel,
  addNewColumn,
}) {
  return (
    <div style={styles.addColumnContainer}>
      <div style={styles.editBlock}>
        <div style={styles.editBlockHeaderContainer}>
          <label style={styles.editBlockHeader}>Add New Column</label>
        </div>
        <div style={styles.addColumnInputs}>
          <dc.Textbox
            value={newHeaderLabel}
            onChange={(e) => setNewHeaderLabel(e.target.value)}
            placeholder="New Header Label"
            style={styles.addColumnTextbox}
          />
          <dc.Textbox
            value={newFieldLabel}
            onChange={(e) => setNewFieldLabel(e.target.value)}
            placeholder="New Data Field"
            style={styles.addColumnTextbox}
          />
        </div>
        <div style={styles.addColumnButtonContainer}>
          <button onClick={addNewColumn} style={styles.centeredAddButton}>
            Add Column
          </button>
        </div>
      </div>
    </div>
  );
}

function PaginationSettings({
  isEnabled,
  setIsEnabled,
  itemsPerPage,
  setItemsPerPage,
}) {
  return (
    <div style={styles.paginationSettingsContainer}>
      <div style={styles.paginationMain}>
        <div style={styles.paginationLeft}>
          <label style={styles.paginationTitle}>Pagination:</label>
          <dc.Checkbox
            label="Enable"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            style={{ marginLeft: "10px" }}
          />
        </div>
        {isEnabled && (
          <div style={styles.paginationRight}>
            <label style={styles.paginationLabel}>Items per Page:</label>
            <dc.Textbox
              type="number"
              min="1"
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              style={styles.paginationTextbox}
              placeholder="10"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DataTable({
  columnsToShow,
  dynamicColumnProperties,
  data,
  groupByColumns,
  groupSortOrders,
  onUpdateEntry,
}) {
  return (
    <div style={styles.tableContainer}>
      <div style={styles.tableHeader}>
        {columnsToShow.map((col) => (
          <div key={col} style={styles.tableHeaderCell}>
            {col}
          </div>
        ))}
      </div>
      <div style={styles.tableContent}>
        {data.length > 0 ? (
          <RenderRows
            data={data}
            columnsToShow={columnsToShow}
            dynamicColumnProperties={dynamicColumnProperties}
            groupByColumns={groupByColumns}
            groupSortOrders={groupSortOrders}
            onUpdateEntry={onUpdateEntry}
          />
        ) : (
          <div style={styles.noData}>No data to display.</div>
        )}
      </div>
    </div>
  );
}

function RenderRows({
  data,
  columnsToShow,
  dynamicColumnProperties,
  groupByColumns,
  groupSortOrders,
  onUpdateEntry,
  groupLevel = 0,
}) {
  if (groupByColumns.length === 0) {
    return data.map((entry, idx) => {
      // Retrieve key properties to ensure this is an existing note
      const name = getProperty(entry, "name.obsidian");
      const mtime = getProperty(entry, "mtime.obsidian");
      const ctime = getProperty(entry, "ctime.obsidian");

      // Skip non-existing notes that have placeholder values
      if (name === "Unnamed" || mtime === "Unknown Last Modified Date" || ctime === "Unknown Date") {
        return null; // Prevent rendering
      }

      return (
        <div key={idx} style={styles.tableRow}>
          {columnsToShow.map((columnId) => {
            const property = dynamicColumnProperties[columnId];
            return (
              <div key={columnId} style={styles.tableCell}>
                {property === "name.obsidian" ? (
                  <DraggableLink
                    entry={entry}
                    title={getProperty(entry, property)}
                  />
                ) : (
                  <EditableCell
                    entry={entry}
                    property={property}
                    onUpdate={onUpdateEntry}
                  />
                )}
              </div>
            );
          })}
        </div>
      );
    });
  } else {
    const groupKey = groupByColumns[0];
    const property = dynamicColumnProperties[groupKey];
    const sortOrder = groupSortOrders[groupKey] || "asc";
    const groups = {};

    data.forEach((entry) => {
      // Retrieve key properties to ensure this is an existing note
      const name = getProperty(entry, "name.obsidian");
      const mtime = getProperty(entry, "mtime.obsidian");
      const ctime = getProperty(entry, "ctime.obsidian");

      // Exclude entries with placeholder values directly in the grouping stage
      if (name === "Unnamed" || mtime === "Unknown Last Modified Date" || ctime === "Unknown Date") {
        return; // Skip this entry
      }

      const key = getProperty(entry, property) || "Uncategorized";
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a < b) return sortOrder === "asc" ? -1 : 1;
      if (a > b) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sortedKeys.map((key, idx) => (
      <div key={idx}>
        <div
          style={{
            ...styles.groupHeader,
            paddingLeft: `${groupLevel * 20}px`,
          }}
        >
          {key}
        </div>
        <RenderRows
          data={groups[key]}
          columnsToShow={columnsToShow}
          dynamicColumnProperties={dynamicColumnProperties}
          groupByColumns={groupByColumns.slice(1)}
          groupSortOrders={groupSortOrders}
          onUpdateEntry={onUpdateEntry}
          groupLevel={groupLevel + 1}
        />
      </div>
    ));
  }
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageInput,
  setPageInput,
  totalEntries,
}) {
  return (
    <div style={styles.pagination}>
      {totalPages > 1 ? (
        <div style={styles.paginationControls}>
          <dc.Button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={styles.button}
          >
            Previous
          </dc.Button>
          <span style={styles.paginationText}>
            Page {currentPage} of {totalPages}
          </span>
          <dc.Textbox
            type="number"
            min="1"
            max={totalPages}
            value={pageInput}
            placeholder="Page #"
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const pageNumber = parseInt(pageInput, 10);
                if (!isNaN(pageNumber)) onPageChange(pageNumber);
              }
            }}
            style={styles.paginationTextbox}
          />
          <dc.Button
            onClick={() => {
              const pageNumber = parseInt(pageInput, 10);
              if (!isNaN(pageNumber)) onPageChange(pageNumber);
            }}
            style={styles.button}
          >
            Go
          </dc.Button>
          <dc.Button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={styles.button}
          >
            Next
          </dc.Button>
        </div>
      ) : (
        <span>Total Entries: {totalEntries}</span>
      )}
    </div>
  );
}

////////////////////////////////////////////////////
///                   Styles                     ///
////////////////////////////////////////////////////

const styles = {
  mainContainer: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--background-primary)",
    color: "var(--text-normal)",
    height: "100%",
  },
  header: {
    padding: "10px",
    backgroundColor: "var(--background-primary)",
  },
  headerTitle: {
    margin: 0,
    paddingBottom: "10px",
    fontSize: "1.5em",
  },
  controlGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    marginBottom: "10px",
  },
  textbox: {
  padding: "8px",
  border: "1px solid var(--background-modifier-border)",
  backgroundColor: "var(--background-primary)",
  color: "var(--text-normal)",
  width: "100%", // Changed from 200px to 100%
  boxSizing: "border-box",
  },
  searchBoxFullWidth: {
    width: "100%",
    padding: "8px",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    backgroundColor: "var(--background-primary)",
    color: "var(--text-normal)",
    boxSizing: "border-box",
  },
  editControlsRow: {
    display: "flex",
    width: "100%",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px",
  },
  editButton: {
    width: "75%",
    padding: "8px",
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  addNewFileButton: {
    flex: "1",
    padding: "8px",
    backgroundColor: "grey",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    textAlign: "center",
    fontWeight: "bold",
  },
  tableContainer: {
    flex: 1,
    overflowY: "auto",
    position: "relative",
  },
  tableHeader: {
    display: "flex",
    backgroundColor: "var(--background-primary)",
    fontWeight: "bold",
    borderBottom: "1px solid var(--background-modifier-border)",
  },
  tableHeaderCell: {
    flex: "1 0 150px",
    minWidth: "150px",
    padding: "10px",
  },
  tableRow: {
    display: "flex",
    borderBottom: "1px solid var(--background-modifier-border)",
  },
  tableCell: {
    flex: "1 0 150px",
    padding: "10px",
  },
  pagination: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    marginTop: "20px",
  },
  navigationButtons: {
    display: "flex",
    gap: "5px",
    width: "100%",
  },
  navButton: {
    flex: "1",
    padding: "8px",
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  pageInfo: {
    display: "flex",
    gap: "5px",
    alignItems: "center",
  },
  paginationTextbox: {
    width: "50px",
    padding: "4px",
  },
  goButtonRow: {
    display: "flex",
    width: "100%",
  },
  goButtonFullWidth: {
    width: "100%",
    padding: "8px",
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    textAlign: "center",
    fontWeight: "bold",
  },
  editingContainer: {
    display: "flex",
    flexDirection: "row",
    gap: "10px",
    padding: "5px",
    overflowX: "auto",
    marginBottom: "20px",
  },
  editBlock: {
    flex: "0 0 auto",
    padding: "10px",
    border: "1px solid var(--background-modifier-border)",
    marginBottom: "10px",
    backgroundColor: "var(--background-secondary)",
    color: "var(--text-normal)",
    borderRadius: "8px",
    cursor: "grab",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minWidth: "250px",
  },
  editBlockHeaderContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  editBlockHeader: {
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  inlineButtonGroup: {
    display: "flex",
    flexDirection: "row",
    gap: "5px",
    alignItems: "center",
    flexWrap: "wrap",
    width: "100%",
  },
  inlineButton: {
    flex: "1",
    padding: "6px 10px",
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "12px",
    textAlign: "center",
    fontWeight: "bold",
  },
  editingSection: {
    marginTop: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  groupHeader: {
    padding: "10px",
    backgroundColor: "var(--background-secondary)",
    fontWeight: "bold",
    borderBottom: "1px solid var(--background-modifier-border)",
  },
  groupOrderControls: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 0",
  },
  groupButtons: {
    display: "flex",
    gap: "5px",
  },
  buttonSmall: {
    padding: "4px 6px",
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "12px",
    flex: "0 0 auto",
    fontWeight: "bold",
  },
  button: {
    padding: "8px 12px",
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    flex: "1",
    textAlign: "center",
    fontWeight: "bold",
  },
};

////////////////////////////////////////////////////
///             Main View Component              ///
////////////////////////////////////////////////////

function View({ initialSettingsOverride = {}, app }) {
  const mergedSettings = useMemo(() => {
    return {
      ...initialSettings,
      ...initialSettingsOverride,
      pagination: {
        ...initialSettings.pagination,
        ...initialSettingsOverride.pagination,
      },
      placeholders: {
        ...initialSettings.placeholders,
        ...initialSettingsOverride.placeholders,
      },
      dynamicColumnProperties: initialSettingsOverride.dynamicColumnProperties
        ? { ...initialSettingsOverride.dynamicColumnProperties }
        : { ...initialSettings.dynamicColumnProperties },
      vaultName: initialSettingsOverride.vaultName
        ? initialSettingsOverride.vaultName
        : initialSettings.vaultName,
      excludedFolders: initialSettingsOverride.excludedFolders
        ? [...initialSettingsOverride.excludedFolders]
        : [...initialSettings.excludedFolders],
    };
  }, [initialSettingsOverride]);

  const [nameFilter, setNameFilter] = useState(
    mergedSettings.initialNameFilter || ""
  );
  const [queryPath, setQueryPath] = useState(mergedSettings.queryPath);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("");
  const [isPaginationEnabled, setIsPaginationEnabled] = useState(
    mergedSettings.pagination.isEnabled
  );
  const [itemsPerPage, setItemsPerPage] = useState(
    mergedSettings.pagination.itemsPerPage
  );
  const [dynamicColumnProperties, setDynamicColumnProperties] = useState(
    mergedSettings.dynamicColumnProperties
  );
  const [columnsToShow, setColumnsToShow] = useState(
    Object.keys(mergedSettings.dynamicColumnProperties)
  );
  const [editedHeaders, setEditedHeaders] = useState({});
  const [editedFields, setEditedFields] = useState({});
  const [newHeaderLabel, setNewHeaderLabel] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [groupByColumns, setGroupByColumns] = useState([]);
  const [groupSortOrders, setGroupSortOrders] = useState({});

  useEffect(() => {
    setColumnsToShow(Object.keys(dynamicColumnProperties));
  }, [dynamicColumnProperties]);

  const qdata = dc.useQuery(`@page and path("${queryPath}")`);

  const filteredData = useMemo(() => {
    let data = qdata.filter((entry) => {
      const searchTerm = nameFilter.toLowerCase();
      const isExcluded = mergedSettings.excludedFolders.some((folder) =>
        entry.$path.startsWith(folder + "/")
      );

      if (isExcluded) return false;

      const matchesSearch = Object.values(dynamicColumnProperties).some((property) => {
        const value = getProperty(entry, property);
        return value.toString().toLowerCase().includes(searchTerm);
      });

      const title = getProperty(entry, "name.obsidian");
      const isUnnamed = title === "Unnamed";
      const hasData = Object.keys(dynamicColumnProperties).some((header) => {
        const property = dynamicColumnProperties[header];
        const value = getProperty(entry, property);
        return value !== "No Data";
      });

      return matchesSearch && !isUnnamed && hasData;
    });

    // Apply grouping and sorting
    if (groupByColumns.length > 0) {
      const groupedData = [];
      
      const groupData = (entries, level = 0) => {
        if (level >= groupByColumns.length) {
          return entries.forEach(entry => groupedData.push(entry));
        }

        const groupKey = groupByColumns[level];
        const property = dynamicColumnProperties[groupKey];
        const sortOrder = groupSortOrders[groupKey] || "asc";
        
        const groups = {};
        entries.forEach(entry => {
          const key = getProperty(entry, property) || "Uncategorized";
          if (!groups[key]) groups[key] = [];
          groups[key].push(entry);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => {
          if (sortOrder === "asc") {
            return a.localeCompare(b);
          } else {
            return b.localeCompare(a);
          }
        });

        sortedKeys.forEach(key => {
          groupedData.push({
            type: "group",
            level,
            key,
            columnId: groupKey
          });
          groupData(groups[key], level + 1);
        });
      };

      groupData(data);
      return groupedData;
    }

    return data;
  }, [qdata, nameFilter, dynamicColumnProperties, mergedSettings.excludedFolders, groupByColumns, groupSortOrders]);

  const paginatedData = useMemo(() => {
    if (isPaginationEnabled) {
      const start = (currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      return filteredData.slice(start, end);
    } else {
      return filteredData;
    }
  }, [filteredData, currentPage, itemsPerPage, isPaginationEnabled]);

  const totalPages = useMemo(() => {
    return isPaginationEnabled
      ? Math.ceil(filteredData.length / itemsPerPage)
      : 1;
  }, [filteredData, isPaginationEnabled, itemsPerPage]);

  const handlePageChange = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      setPageInput("");
    }
  };

  const handleAddNewFile = () => {
    const event = new KeyboardEvent("keydown", {
      key: "Q",
      code: "KeyQ",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  const addNewColumn = () => {
    if (!newHeaderLabel || !newFieldLabel) {
      alert("Please provide both a new header label and a data field.");
      return;
    }
    if (columnsToShow.includes(newHeaderLabel)) {
      alert("Header label already exists. Please choose a different name.");
      return;
    }
    const updatedColumns = {
      ...dynamicColumnProperties,
      [newHeaderLabel]: newFieldLabel,
    };
    setDynamicColumnProperties(updatedColumns);
    setColumnsToShow([...columnsToShow, newHeaderLabel]);
    setNewHeaderLabel("");
    setNewFieldLabel("");
  };

  const updateColumn = (columnId, newHeader, newField) => {
    if (newHeader !== columnId && columnsToShow.includes(newHeader)) {
      alert(`Header "${newHeader}" already exists. Please choose a different name.`);
      setEditedHeaders((prev) => ({
        ...prev,
        [columnId]: columnId,
      }));
      return;
    }

    setDynamicColumnProperties((prev) => {
      const updated = { ...prev };
      delete updated[columnId];
      updated[newHeader] = newField;
      return updated;
    });

    setColumnsToShow((prev) =>
      prev.map((col) => (col === columnId ? newHeader : col))
    );

    setGroupByColumns((prev) =>
      prev.map((col) => (col === columnId ? newHeader : col))
    );

    setEditedHeaders((prev) => {
      const newHeaders = { ...prev };
      delete newHeaders[columnId];
      return newHeaders;
    });
    setEditedFields((prev) => {
      const newFields = { ...prev };
      delete newFields[columnId];
      return newFields;
    });
  };

  const removeColumn = (columnId) => {
    const confirmDelete = confirm(`Are you sure you want to remove "${columnId}"?`);
    if (!confirmDelete) return;

    const updatedColumns = { ...dynamicColumnProperties };
    delete updatedColumns[columnId];
    setDynamicColumnProperties(updatedColumns);
    setColumnsToShow(columnsToShow.filter((col) => col !== columnId));
    setGroupByColumns(groupByColumns.filter((col) => col !== columnId));

    setEditedHeaders((prev) => {
      const newHeaders = { ...prev };
      delete newHeaders[columnId];
      return newHeaders;
    });
    setEditedFields((prev) => {
      const newFields = { ...prev };
      delete newFields[columnId];
      return newFields;
    });
  };

  return (
    <dc.Stack
      style={{ ...styles.mainContainer, height: mergedSettings.viewHeight }}
    >
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>
          {mergedSettings.placeholders.headerTitle}
        </h1>

        {/* Search Notes textbox */}
        <div style={styles.controlGroup}>
          <dc.Textbox
            type="search"
            placeholder={mergedSettings.placeholders.nameFilter}
            value={nameFilter}
            onChange={(e) => {
              setNameFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={styles.searchBoxFullWidth}
          />
        </div>

        {/* Enter Path textbox */}
        <div style={styles.controlGroup}>
          <dc.Textbox
            value={queryPath}
            placeholder={mergedSettings.placeholders.queryPath}
            onChange={(e) => {
              setQueryPath(e.target.value);
              setCurrentPage(1);
            }}
            style={styles.searchBoxFullWidth}
          />
        </div>

        <div style={styles.editControlsRow}>
          <dc.Button
            onClick={() => setIsEditing(!isEditing)}
            style={styles.editButton}
          >
            {isEditing ? "Finish Editing" : "Edit"}
          </dc.Button>
          <dc.Button onClick={handleAddNewFile} style={styles.addNewFileButton}>
            Add New File
          </dc.Button>
        </div>

        {isEditing && (
          <div style={styles.editingSection}>
            <dc.Group style={styles.controlGroup}>
              <PaginationSettings
                isEnabled={isPaginationEnabled}
                setIsEnabled={setIsPaginationEnabled}
                itemsPerPage={itemsPerPage}
                setItemsPerPage={setItemsPerPage}
              />
            </dc.Group>
            <div style={styles.editingContainer}>
              {columnsToShow.map((columnId, index) => (
                <EditColumnBlock
                  key={columnId}
                  columnId={columnId}
                  index={index}
                  columnsToShow={columnsToShow}
                  setColumnsToShow={setColumnsToShow}
                  editedHeaders={editedHeaders}
                  setEditedHeaders={setEditedHeaders}
                  editedFields={editedFields}
                  setEditedFields={setEditedFields}
                  updateColumn={updateColumn}
                  removeColumn={removeColumn}
                  dynamicColumnProperties={dynamicColumnProperties}
                  groupByColumns={groupByColumns}
                  setGroupByColumns={setGroupByColumns}
                  groupSortOrders={groupSortOrders}
                  setGroupSortOrders={setGroupSortOrders}
                />
              ))}
              <AddColumn
                newHeaderLabel={newHeaderLabel}
                setNewHeaderLabel={setNewHeaderLabel}
                newFieldLabel={newFieldLabel}
                setNewFieldLabel={setNewFieldLabel}
                addNewColumn={addNewColumn}
              />
            </div>
          </div>
        )}
      </div>

      <div style={styles.tableContainer}>
        {/* Header Row */}
        <div style={styles.tableHeader}>
          {columnsToShow.map((col) => (
            <div key={col} style={styles.tableHeaderCell}>
              {col}
            </div>
          ))}
        </div>
        {/* Data Rows */}
        {paginatedData.map((item, idx) => {
          if (item.type === "group") {
            return (
              <div
                key={`group-${idx}`}
                style={{
                  ...styles.groupHeader,
                  paddingLeft: `${item.level * 20}px`,
                }}
              >
                {item.key}
              </div>
            );
          } else {
            // This is a regular data entry
            return (
              <div key={`row-${idx}`} style={styles.tableRow}>
                {columnsToShow.map((columnId) => {
                  const property = dynamicColumnProperties[columnId];
                  return (
                    <div key={columnId} style={styles.tableCell}>
                      {property === "name.obsidian" ? (
                        <a
                          href="#"
                          className="internal-link"
                          draggable
                          data-href={item.$path}
                          title={`Drag to copy [[${item.$name}]]`}
                        >
                          {getProperty(item, property)}
                        </a>
                      ) : (
                        getProperty(item, property)
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
        })}
      </div>

      <div style={styles.pagination}>
        <div style={styles.navigationButtons}>
          <dc.Button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={styles.navButton}
          >
            Previous
          </dc.Button>
          <dc.Button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={styles.navButton}
          >
            Next
          </dc.Button>
        </div>
        <div style={styles.pageInfo}>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <dc.Textbox
            type="number"
            min="1"
            max={totalPages}
            value={pageInput}
            placeholder="Page #"
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const pageNumber = parseInt(pageInput, 10);
                if (!isNaN(pageNumber)) handlePageChange(pageNumber);
              }
            }}
            style={styles.paginationTextbox}
          />
          <span>Total Entries: {filteredData.length}</span>
        </div>
        <div style={styles.goButtonRow}>
          <dc.Button
            onClick={() => handlePageChange(parseInt(pageInput, 10))}
            style={styles.goButtonFullWidth}
          >
            Go
          </dc.Button>
        </div>
      </div>
    </dc.Stack>
  );
}

return View;

```
