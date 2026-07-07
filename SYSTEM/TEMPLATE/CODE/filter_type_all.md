<%*
const file = app.workspace.getActiveFile();
if (file) {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm.filter_type = "전체종류";
  });
}
%>