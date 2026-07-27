---
journal: personal daily
journal-date: <% tp.file.title %>
journal-start-date: <% tp.file.title %>
journal-end-date: <% tp.file.title %>
type: journal
date: <% tp.file.title %>
status: doing
completed_at:
reflection:
change:
next_experiment:
connections:
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# <% tp.file.title %>

```calendar-nav
```

## Daily Intention
*오늘 한 가지에만 집중한다면?*
-

## Evidence
<!-- Evidence Blocks: each ### is one meaningful experience. Use Journal 「+ 경험 추가」 or free-text propose. -->

## End of Day

### Overall Change
*하루를 관통하는 변화가 있다면 (선택)*
-

### Tomorrow
*내일 시험할 한 가지 (선택)*
-

# Reflection
<!-- Legacy single-reflection fields — still read by Evidence Builder if ## Evidence is empty -->

## 성찰 (Reflection)
*오늘 가장 중요했던 일이나 깨달음은 무엇인가? (단일 성찰 모드)*
-

## 변화 (Change)
*오늘 무엇이 달라졌는가?*
-

## 다음 실험 (Next Experiment)
*내일 또는 다음번에 무엇을 시험할 것인가?*
-

## 연관 참조 (References)
*오늘의 성찰과 직접적으로 연관된 다른 노트·사람·태스크 링크만 간단히 남깁니다. (중복 작성 금지)*
*사람 연결은 YAML `connections` 또는 아래 wikilink를 사용합니다.*
-

# Tasks

````tabs
tab: Due Today
```tasks
not done
due <% tp.file.title %>
sort by priority
hide due date
limit 10
```
tab: Overdue
```tasks 
not done 
due before <% tp.file.title %>
sort by priority
hide due date
limit 10
```
tab: Completed
```tasks
done <% tp.file.title %>
hide done date
hide due date
limit 10
```
````

# Overview

````tabs
tab: Meetings
```dataviewjs
let meetings = dv.pages('"PARA/RESOURCES/MEETINGS"')
    .where(m => m.meeting_status === false && m.type === "meeting");

// Separate meetings with and without scheduled dates
let withDates = meetings.where(m => m.scheduled_date);
let withoutDates = meetings.where(m => !m.scheduled_date);

// Sort meetings with dates by scheduled date
withDates = withDates.sort(m => m.scheduled_date);

// Combine both lists, with meetings having dates first
let allMeetings = withDates.concat(withoutDates);

// Render the table with clickable meeting links
dv.table(
    ["Days", "Meeting", "Scheduled Date", "Start Time", "End Time"],
    allMeetings.map(m => [
        m.scheduled_date ? Math.floor(dv.date(m.scheduled_date).diff(dv.date("today"), 'days').days) : "-", // Calculate days until the meeting
        m.file.link, // Use m.file.link to render the meeting name as a clickable link
        m.scheduled_date ? dv.date(m.scheduled_date).toFormat("MM-dd") : "-",
        m.start_time || "-",
        m.end_time || "-"
    ])
);
```
tab: Projects
```dataviewjs
let pages = dv.pages('"PARA/PROJECTS"')
    .where(p => (p.type == "project_note" || p.type == "project_family") && p.Status != "4 Completed");

// Separate pages with and without due dates
let withDueDates = pages.where(p => p.Due_Date != null);
let withoutDueDates = pages.where(p => !p.Due_Date);

// Sort pages with due dates by: Due Date -> Priority Level (A-Z) -> Status (Z-A)
withDueDates = withDueDates.sort(p => p.Due_Date)
    .sort(p => p.Priority_Level)
    .sort(p => p.Status, 'desc');

// Sort pages without due dates by: Priority Level (A-Z) -> Status (Z-A)
withoutDueDates = withoutDueDates.sort(p => p.Priority_Level)
    .sort(p => p.Status, 'desc');

// Combine both lists
let allPages = withDueDates.concat(withoutDueDates);

// Render the table with clickable project links
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
