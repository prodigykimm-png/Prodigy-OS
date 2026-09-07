"use strict";

const { Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = Object.freeze({ kakaoRestApiKey: "" });
const TEST_ENDPOINT = "https://dapi.kakao.com/v2/local/search/address.json?query=" + encodeURIComponent("부산광역시 중구 중앙대로 120");

function normalizeSettings(value) {
  return { kakaoRestApiKey: typeof value?.kakaoRestApiKey === "string" ? value.kakaoRestApiKey.trim() : "" };
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => Number(value) * Math.PI / 180;
  const aLat = toRad(lat1);
  const bLat = toRad(lat2);
  const dLat = bLat - aLat;
  const dLng = toRad(lng2) - toRad(lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function nearestPlace(documents, latitude, longitude) {
  const ranked = (Array.isArray(documents) ? documents : []).map((place) => ({
    name: place.place_name || place.address_name || "",
    address: place.road_address_name || place.address_name || "",
    latitude: Number(place.y),
    longitude: Number(place.x),
    distanceM: distanceMeters(latitude, longitude, place.y, place.x)
  })).filter((place) => place.name && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
  ranked.sort((a, b) => a.distanceM - b.distanceM);
  return ranked[0] || null;
}

async function kakaoJson(path, key, fetchImpl = fetch) {
  const response = await fetchImpl(`https://dapi.kakao.com${path}`, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "카카오 REST API 키가 유효하지 않습니다." : `카카오 API 응답 오류(${response.status})`);
  return response.json();
}

async function calculateBasicLocation(address, key, fetchImpl = fetch) {
  const normalizedAddress = typeof address === "string" ? address.trim() : "";
  const normalizedKey = typeof key === "string" ? key.trim() : "";
  if (!normalizedAddress) throw new Error("옥션카드 주소가 비어 있습니다.");
  if (!normalizedKey) throw new Error("Dusk Auction 설정에서 카카오 REST API 키를 먼저 저장하세요.");
  const geocoded = await kakaoJson(`/v2/local/search/address.json?query=${encodeURIComponent(normalizedAddress)}`, normalizedKey, fetchImpl);
  const point = geocoded.documents?.[0];
  if (!point) throw new Error("카카오 주소 검색에서 좌표를 찾지 못했습니다.");
  const latitude = Number(point.y);
  const longitude = Number(point.x);
  const search = (query, category) => kakaoJson(`/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&category_group_code=${category}&x=${longitude}&y=${latitude}&radius=20000&size=15&sort=distance`, normalizedKey, fetchImpl);
  const [station, elementary, middle, high] = await Promise.all([
    search("지하철역", "SW8"), search("초등학교", "SC4"), search("중학교", "SC4"), search("고등학교", "SC4")
  ]);
  return Object.freeze({
    address: normalizedAddress,
    latitude,
    longitude,
    nearestStation: nearestPlace(station.documents, latitude, longitude),
    nearestElementarySchool: nearestPlace(elementary.documents, latitude, longitude),
    nearestMiddleSchool: nearestPlace(middle.documents, latitude, longitude),
    nearestHighSchool: nearestPlace(high.documents, latitude, longitude),
    distanceType: "straight_line",
    aiUsed: false,
    checkedAt: new Date().toISOString()
  });
}

async function verifyKakaoKey(key, fetchImpl = fetch) {
  const normalized = typeof key === "string" ? key.trim() : "";
  if (!normalized) return Object.freeze({ ok: false, code: "missing", message: "카카오 REST API 키를 먼저 저장하세요." });
  try {
    const response = await fetchImpl(TEST_ENDPOINT, { headers: { Authorization: `KakaoAK ${normalized}` } });
    if (response.ok) return Object.freeze({ ok: true, code: "connected", message: "카카오 Local API 연결에 성공했습니다." });
    if (response.status === 401 || response.status === 403) return Object.freeze({ ok: false, code: "unauthorized", message: "키가 유효하지 않거나 Local API 사용 권한이 없습니다." });
    return Object.freeze({ ok: false, code: "http_error", message: `카카오 API 응답 오류(${response.status})` });
  } catch (_error) {
    return Object.freeze({ ok: false, code: "network_error", message: "네트워크 오류로 연결을 확인하지 못했습니다." });
  }
}

class DuskAuctionSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Dusk Auction" });
    containerEl.createEl("p", { text: "기본 입지 자동계산에 사용할 로컬 API 설정입니다. 저장된 키 원문은 화면에 다시 표시하지 않습니다." });

    let pendingKey = "";
    const statusText = this.plugin.hasKakaoKey() ? "저장됨" : "미설정";
    new Setting(containerEl)
      .setName("카카오 REST API 키")
      .setDesc(`현재 상태: ${statusText} · Kakao Developers의 앱 키 중 REST API 키를 입력하세요.`)
      .addText((text) => {
        text.setPlaceholder(this.plugin.hasKakaoKey() ? "새 키로 교체하려면 입력" : "REST API 키 입력");
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "new-password";
        text.onChange((value) => { pendingKey = value; });
      })
      .addButton((button) => button.setButtonText("저장").setCta().onClick(async () => {
        if (!pendingKey.trim()) {
          new Notice("저장할 카카오 REST API 키를 입력하세요.");
          return;
        }
        await this.plugin.setKakaoKey(pendingKey);
        pendingKey = "";
        new Notice("카카오 REST API 키를 로컬 설정에 저장했습니다.");
        this.display();
      }));

    new Setting(containerEl)
      .setName("연결 확인")
      .setDesc("저장된 키로 카카오 주소 검색 API 인증만 확인합니다. 키는 로그나 화면에 출력하지 않습니다.")
      .addButton((button) => button.setButtonText("연결 확인").onClick(async () => {
        button.setDisabled(true).setButtonText("확인 중…");
        const result = await this.plugin.verifyConnection();
        new Notice(result.message);
        button.setDisabled(false).setButtonText("연결 확인");
      }));

    new Setting(containerEl)
      .setName("저장된 키 삭제")
      .setDesc("이 기기의 Dusk Auction 로컬 설정에서 카카오 키를 제거합니다.")
      .addButton((button) => button.setButtonText("삭제").setWarning().setDisabled(!this.plugin.hasKakaoKey()).onClick(async () => {
        await this.plugin.setKakaoKey("");
        new Notice("저장된 카카오 REST API 키를 삭제했습니다.");
        this.display();
      }));
  }
}

class DuskAuctionSettingsPlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new DuskAuctionSettingTab(this.app, this));
    globalThis.DuskAuctionLocation = Object.freeze({
      calculateBasicLocation: (address) => this.calculateBasicLocation(address),
      isConfigured: () => this.hasKakaoKey()
    });
  }

  onunload() {
    if (globalThis.DuskAuctionLocation) delete globalThis.DuskAuctionLocation;
  }

  hasKakaoKey() {
    return Boolean(this.settings.kakaoRestApiKey);
  }

  async setKakaoKey(value) {
    this.settings = normalizeSettings({ ...this.settings, kakaoRestApiKey: value });
    await this.saveData(this.settings);
  }

  async verifyConnection(fetchImpl) {
    return verifyKakaoKey(this.settings.kakaoRestApiKey, fetchImpl);
  }

  async calculateBasicLocation(address, fetchImpl) {
    return calculateBasicLocation(address, this.settings.kakaoRestApiKey, fetchImpl);
  }
}

module.exports = DuskAuctionSettingsPlugin;
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
module.exports.normalizeSettings = normalizeSettings;
module.exports.distanceMeters = distanceMeters;
module.exports.nearestPlace = nearestPlace;
module.exports.calculateBasicLocation = calculateBasicLocation;
module.exports.verifyKakaoKey = verifyKakaoKey;
