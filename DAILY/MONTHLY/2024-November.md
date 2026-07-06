---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
journal: personal monthly
journal-start-date: 2024-11-01
journal-end-date: 2024-11-30
journal-date: 2024-11-01
---
# Monthly Notes
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
- [x]  Finalize all contracts with renewable energy providers for the Green Data Center Initiative
- [ ]  Complete the full feasibility study for the orbital hotel project, including market and design analysis
- [x]  Conduct user testing on the AI transparency interface and gather feedback for improvements
- [ ]  Enhance security protocols in NGINX to mitigate DDoS and brute force attacks, with initial tests on rate limiting
# Summary of the Month
This month marked significant strides in our commitment to sustainability and AI ethics. We finalized contracts with renewable energy providers, which is a major milestone toward achieving carbon-neutral operations across data centers. User testing for the AI transparency interface yielded valuable insights, helping us refine the interface to improve user understanding and trust. Security remained a top priority as we continued to identify vulnerabilities in our NGINX configurations; while progress was made, some key areas still require attention. The orbital hotel feasibility study is progressing but remains incomplete, with more work needed on financial projections and design feasibility.
# Reflections & Learnings
- **Sustainability Commitment**: Completing the renewable energy contracts felt like a breakthrough for our Green Data Center Initiative. It highlighted how effective partnerships can be when aligned with clear, shared environmental goals.
- **AI Transparency**: The feedback from user testing on the AI transparency interface underscored the importance of clear communication. Many users valued transparency but found certain technical details overwhelming, emphasizing the need to balance simplicity with information depth.
- **Security Challenges**: This month revealed ongoing complexities in security management for our web infrastructure. While rate limiting provided some mitigation against brute force attacks, further adjustments are essential to protect against more sophisticated threats.
# Plan for Next Month
- Finalize the orbital hotel feasibility report, focusing on solidifying financial models and obtaining stakeholder approval.
- Begin the initial rollout of renewable energy solutions in selected data centers, closely monitoring integration and performance.
- Implement improvements to the AI transparency interface based on user feedback, with a second phase of testing scheduled for the end of the month.
- Enhance and deploy the updated NGINX security configurations, including more robust DDoS prevention and IP blocking mechanisms to strengthen overall system resilience.