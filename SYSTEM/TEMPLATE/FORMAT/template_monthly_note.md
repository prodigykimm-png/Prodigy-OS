---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
journal: monthly
journal-start-date: {{month_start_date}}
journal-end-date: {{month_end_date}}
journal-section: month
---
# <% tp.file.title %>

```calendar-timeline
mode: month
```

````tabs
tab: Overview
```dataviewjs
let startDate = dv.current().file.frontmatter["journal-start-date"];
let endDate = dv.current().file.frontmatter["journal-end-date"];

let tasks = dv.pages().file.tasks
    .where(t => !t.completed && t.due && t.due >= dv.date(startDate) && t.due <= dv.date(endDate))
    .sort(t => t.priority);

let completedTasks = dv.pages().file.tasks
    .where(t => t.completed && t.completion && t.completion >= dv.date(startDate) && t.completion <= dv.date(endDate));

function cleanTaskText(text) {
    return text
        .replace(/#task\s+/, '')
        .replace(/📅\s*\d{4}-\d{2}-\d{2}/, '')
        .replace(/✅\s*\d{4}-\d{2}-\d{2}/, '')
        .replace(/#[\w\/]+\s*/g, '')
        .trim();
}

function createLink(path) {
    if (!path) return "-";
    const fileName = path.split('/').pop();
    return `[[${fileName}]]`;
}

dv.table(
    ["Source", "Date Due", "Task Description"],
    tasks.map(t => [
        createLink(t.path),
        t.due ? dv.date(t.due).toFormat("MM-dd") : "-",
        cleanTaskText(t.text)
    ])
);

dv.paragraph('<br><strong>Completed Tasks</strong><br>');

dv.table(
    ["Source", "Date Done", "Task Description"],
    completedTasks.map(t => [
        createLink(t.path),
        t.completion ? dv.date(t.completion).toFormat("MM-dd") : "-",
        cleanTaskText(t.text)
    ])
);
```
tab: Meetings
```dataviewjs
let startDate = dv.current().file.frontmatter["journal-start-date"];
let endDate = dv.current().file.frontmatter["journal-end-date"];

let meetings = dv.pages('"PARA/RESOURCES/MEETINGS"')
    .where(m => m.meeting_status === false && m.type === "meeting" && m.scheduled_date >= dv.date(startDate) && m.scheduled_date <= dv.date(endDate));

let withDates = meetings.where(m => m.scheduled_date);
let withoutDates = meetings.where(m => !m.scheduled_date);

withDates = withDates.sort(m => m.scheduled_date);

let allMeetings = withDates.concat(withoutDates);

dv.table(
    ["Days", "Meeting", "Scheduled Date", "Start Time", "End Time"],
    allMeetings.map(m => [
        m.scheduled_date ? Math.floor(dv.date(m.scheduled_date).diff(dv.date("today"), 'days').days) : "-",
        m.file.link,
        m.scheduled_date ? dv.date(m.scheduled_date).toFormat("MM-dd") : "-",
        m.start_time || "-",
        m.end_time || "-"
    ])
);
```
tab: Projects
```dataviewjs
let startDate = dv.current().file.frontmatter["journal-start-date"];
let endDate = dv.current().file.frontmatter["journal-end-date"];

let pages = dv.pages('"PARA/PROJECTS"')
    .where(p => (p.type == "project_note" || p.type == "project_family") 
            && p.Status != "4 Completed" 
            && p.Due_Date >= dv.date(startDate) 
            && p.Due_Date <= dv.date(endDate));

let withDueDates = pages.where(p => p.Due_Date != null);
let withoutDueDates = pages.where(p => p.Due_Date == null);

withDueDates = withDueDates.sort(p => p.Due_Date)
    .sort(p => p.Priority_Level)
    .sort(p => p.Status, 'desc');

withoutDueDates = withoutDueDates.sort(p => p.Priority_Level)
    .sort(p => p.Status, 'desc');

let allPages = withDueDates.concat(withoutDueDates);

dv.table(
    ["Days", "Project", "Priority Level", "Status", "Due Date"],
    allPages.map(p => [
        p.Due_Date ? Math.floor(dv.date(p.Due_Date).diff(dv.date("today"), 'days').days) : "-",
        p.file.link,
        p.Priority_Level || "-",
        p.Status || "-",
        p.Due_Date ? dv.date(p.Due_Date).toFormat("MM-dd") : "-"
    ])
);
```
tab: Areas
```dataview
table area_category as "Area Category", created as "Date Created" from "PARA/AREAS"
WHERE type = "area_family"
```
````

# Monthly Goals


# Summary of the Month


# Reflections & Learnings


# 검증된 원칙 (Validated Principles)

*한 달 동안 충분한 증거와 패턴 분석을 통해 타당성이 검증된 원칙들입니다. 이 원칙들은 영구 지식 문서(ZETA)로 최종 채택됩니다.*

- 

# 반려된 원칙 (Rejected Principles)

*검증 과정에서 부적절하거나 현재 적용하기 부적절하여 보류 또는 영구 제외된 원칙들입니다.*

- 


# Plan for Next Month