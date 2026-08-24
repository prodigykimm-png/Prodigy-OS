---
cssclasses:
  - prodigy-native-approval
---

# Apple 기본 앱 UI — Mac Pilot

> [!important] 지금 확인할 범위
> Home과 Auction의 **Mac 기본 앱 방향**만 확인합니다.<br>
> 새 pane-scene 구성을 iPhone과 iPad에 확장하는 작업은 승인 전까지 시작하지 않습니다.

```dataviewjs
const screens = [
  {
    id: "home",
    title: "Home",
    question: "작업을 바로 시작하는 Apple 기본 생산성 앱의 Home처럼 보이나요?",
    references: [
      {
        label: "Apple Home",
        appStore: "https://apps.apple.com/us/app/home/id1110145103",
        image: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/33/a7/49/33a74947-7fe4-0bae-c65b-791c6ed65432/Ipad_Home_Screen.jpg/360x480bb.jpg"
      }
    ],
    pilots: [
      {
        path: ".omo/evidence/apple-ui-native-pilot/screenshots/home-mac-1440-light.png",
        caption: "Prodigy OS · Home Mac pilot"
      }
    ],
    points: [
      "연속 source-list sidebar",
      "날짜·제목·compact toolbar",
      "Morning Brief·Continue·Focus grouped content"
    ]
  },
  {
    id: "auction",
    title: "Auction",
    question: "Reminders와 Notes 계열의 list/detail 경매 작업 앱처럼 보이나요?",
    references: [
      {
        label: "Apple Reminders",
        appStore: "https://apps.apple.com/us/app/reminders/id1108187841",
        image: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/f1/00/82/f1008246-3829-deab-2e58-4a2f152e9a4c/1_iPad_Today_screen.PNG/360x480bb.jpg"
      },
      {
        label: "Apple Notes",
        appStore: "https://apps.apple.com/us/app/notes/id1110145109",
        image: "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/02/f6/94/02f69477-9ea2-56ee-4fb5-53aea34b17f5/1_Notes_iPad_Screen.PNG/360x480bb.jpg"
      }
    ],
    pilots: [
      {
        path: ".omo/evidence/apple-ui-native-pilot/screenshots/auction-mac-1440-light.png",
        caption: "Prodigy OS · Auction Mac pilot"
      },
      {
        path: ".omo/evidence/apple-ui-native-pilot/screenshots/auction-calendar-mac-1440-light.png",
        caption: "Prodigy OS · Auction integrated calendar"
      },
      {
        path: ".omo/evidence/apple-ui-native-pilot/screenshots/auction-calendar-scene-mac-1440-light.png",
        caption: "Prodigy OS · Auction Calendar pane scene"
      }
    ],
    points: [
      "오늘·달력 source-list navigation",
      "Auction case list · 선택된 Continue detail pane",
      "스크롤 없이 전환되는 Calendar pane scene · 기존 달력 UI와 동작 보존",
      "Auction Card 내용·순서·동작 보존"
    ]
  }
];

const root = this.container.createEl("div", {
  attr: { class: "native-approval-root" }
});

for (const screen of screens) {
  const chapter = root.createEl("section", {
    attr: {
      class: "native-approval-chapter",
      "data-native-screen": screen.id
    }
  });
  chapter.createEl("p", {
    text: "APPLE BUILT-IN APP → PRODIGY OS",
    attr: { class: "native-approval-kicker" }
  });
  chapter.createEl("h2", {
    text: screen.title,
    attr: { class: "native-approval-title" }
  });
  chapter.createEl("p", {
    text: screen.question,
    attr: { class: "native-approval-question" }
  });

  const comparison = chapter.createEl("div", {
    attr: { class: "native-approval-comparison" }
  });
  for (const reference of screen.references) {
    const frame = comparison.createEl("a", {
      href: reference.appStore,
      attr: {
        class: "native-approval-frame is-reference",
        "aria-label": `${reference.label} App Store 열기`
      }
    });
    frame.createEl("img", {
      attr: {
        src: reference.image,
        alt: `${reference.label} 공식 App Store 화면`
      }
    });
    frame.createEl("span", {
      text: `${reference.label} · 공식 App Store`,
      attr: { class: "native-approval-caption" }
    });
  }

  for (const pilot of screen.pilots) {
    const frame = comparison.createEl("figure", {
      attr: { class: "native-approval-frame is-pilot" }
    });
    frame.createEl("img", {
      attr: {
        src: app.vault.adapter.getResourcePath(pilot.path),
        alt: pilot.caption
      }
    });
    frame.createEl("figcaption", {
      text: pilot.caption,
      attr: { class: "native-approval-caption" }
    });
  }

  const points = chapter.createEl("ul", {
    attr: { class: "native-approval-points" }
  });
  for (const point of screen.points) points.createEl("li", { text: point });
}

const decision = root.createEl("section", {
  attr: { class: "native-approval-decision" }
});
decision.createEl("h2", { text: "결정" });
decision.createEl("p", {
  text: "맞으면 “Mac 기본 앱 방향 승인”, 아니면 가장 먼저 native하지 않게 느껴지는 요소 하나를 알려주세요."
});
```
