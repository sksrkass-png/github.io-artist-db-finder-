const fs = require("fs");
const path = require("path");

const {
  AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_NAME = "Artists_Master",
  AIRTABLE_VIEW_NAME = "WEB_EXPORT",
} = process.env;

const outputPath = path.join(__dirname, "../data/artists.json");

if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID. Add them in GitHub Repository Secrets.");
  process.exit(1);
}

function extractUrlsFromText(value) {
  if (!value) return [];
  const text = String(value);
  const urls = [];

  for (const match of text.matchAll(/\((https?:\/\/[^)]+)\)/g)) {
    urls.push(match[1]);
  }

  for (const match of text.matchAll(/https?:\/\/[^\s,)]+/g)) {
    if (!urls.includes(match[0])) urls.push(match[0]);
  }

  return urls;
}

function attachmentUrls(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return extractUrlsFromText(item)[0] || item;
        return item.url || item.thumbnails?.large?.url || item.thumbnails?.full?.url || item.thumbnails?.small?.url || "";
      })
      .filter(Boolean);
  }

  return extractUrlsFromText(value);
}

function splitMulti(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(String).map((v) => v.trim()).filter(Boolean);
  }

  return String(value)
    .split(/[,/]|\n/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return 0;

  const raw = String(value).trim().toLowerCase().replace(/,/g, "");

  if (raw.endsWith("k")) return Math.round(parseFloat(raw) * 1000) || 0;
  if (raw.endsWith("m")) return Math.round(parseFloat(raw) * 1000000) || 0;

  return Number(raw.replace(/[^0-9.]/g, "")) || 0;
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  if (!value) return false;

  return ["true", "yes", "y", "추천", "1", "checked", "o", "ok"].includes(
    String(value).trim().toLowerCase()
  );
}

function getField(fields, names, fallback = "") {
  for (const name of names) {
    if (fields[name] !== undefined && fields[name] !== null && fields[name] !== "") {
      return fields[name];
    }
  }

  return fallback;
}

function makeScore(a) {
  let score = 50;

  if (a.recommended) score += 20;
  if (a.followers >= 100000) score += 18;
  else if (a.followers >= 50000) score += 15;
  else if (a.followers >= 10000) score += 12;
  else if (a.followers >= 5000) score += 9;
  else if (a.followers >= 1000) score += 5;

  if (a.instagramUrl) score += 5;
  if (a.websiteUrl) score += 4;
  if (a.email) score += 4;
  if ((a.artworkImages || []).length >= 3) score += 5;
  if ((a.categoryMain || []).length) score += 3;

  return Math.min(99, score);
}

function mapRecord(record) {
  const f = record.fields || {};

  const imageUrlField = getField(f, ["대표 이미지 URL", "imageUrl", "Image URL", "작품 이미지 URL"], "");
  const attachmentField = getField(f, ["대표작 이미지", "대표 이미지", "Artwork Images", "작품 이미지"], []);
  const attachmentImageUrls = attachmentUrls(attachmentField);
  const separateImageUrls = splitMulti(getField(f, ["작품 이미지 URL 3개", "작품 이미지 URLs", "artworkImages"], ""));

  const artworkImages = [...separateImageUrls, ...attachmentImageUrls]
    .filter(Boolean)
    .filter((url, idx, arr) => arr.indexOf(url) === idx)
    .slice(0, 3);

  const imageUrl = imageUrlField || artworkImages[0] || "";

  const artist = {
    id: record.id,
    artistId: getField(f, ["Artist ID", "artistId"], record.id),

    nameKo: getField(f, ["이름(한글)", "nameKo", "작가명", "한글 이름"], ""),
    nameEn: getField(f, ["이름(Eng)", "nameEn", "영문 이름", "Artist Name EN"], ""),

    followers: normalizeNumber(getField(f, ["팔로워 수", "followers", "Instagram Followers"], 0)),
    instagramUrl: getField(f, ["인스타그램 주소", "instagramUrl", "Instagram URL"], ""),

    imageUrl,
    artworkImages,
    artworks: artworkImages.map((url, idx) => ({
      title: `작품 ${idx + 1}`,
      imageUrl: url,
      medium: splitMulti(getField(f, ["무드 3(재료)", "무드_재료", "moodMaterial"], "")).join(", "),
      description: "Airtable 대표작 이미지 필드에서 불러온 작품입니다.",
    })),

    categoryMain: splitMulti(getField(f, ["분야1", "분야1 (대분야)", "categoryMain"], "")),
    categorySub: splitMulti(getField(f, ["분야2", "분야2 (세부분야)", "categorySub"], "")),

    moodColor: splitMulti(getField(f, ["무드 1(컬러)", "무드_컬러", "moodColor"], "")),
    moodIcon: splitMulti(getField(f, ["무드 2(도상)", "무드_도상", "moodIcon"], "")),
    moodMaterial: splitMulti(getField(f, ["무드 3(재료)", "무드_재료", "moodMaterial"], "")),
    moodFeeling: splitMulti(getField(f, ["무드 4(느낌)", "무드_느낌", "moodFeeling"], "")),

    websiteUrl: getField(f, ["홈페이지 주소", "websiteUrl", "Website"], ""),
    email: getField(f, ["이메일 주소", "email", "Email"], ""),
    phone: getField(f, ["연락처", "phone", "Phone", "전화번호", "Contact"], ""),

    tools: splitMulti(getField(f, ["활용툴", "tools"], "")),
    residenceType: getField(f, ["거주(국내/해외)", "거주", "residenceType"], ""),
    regionKo: getField(f, ["국내 거주지역", "regionKo"], ""),
    gender: getField(f, ["성별", "gender"], ""),
    birthYear: getField(f, ["출생년도", "birthYear"], ""),
    clients: getField(f, ["대표 클라이언트 / 소속", "clients"], ""),

    recommended: boolValue(getField(f, ["추천", "recommended"], false)),
    status: getField(f, ["최종 검수 상태", "status"], ""),
    updatedAt: getField(f, ["Last Modified", "Created", "createdTime", "updatedAt"], record.createdTime || ""),
  };

  artist.score = makeScore(artist);
  artist.initial = (artist.nameKo || artist.nameEn || "?").slice(0, 1);

  return artist;
}

async function fetchAllRecords() {
  const table = encodeURIComponent(AIRTABLE_TABLE_NAME);
  const view = encodeURIComponent(AIRTABLE_VIEW_NAME);
  const all = [];

  let offset = null;

  do {
    const params = new URLSearchParams({ pageSize: "100", view });
    if (offset) params.set("offset", offset);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${table}?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
    });

    if (!res.ok) {
      console.error(await res.text());
      throw new Error(`Airtable API error: ${res.status}`);
    }

    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset || null;

    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (offset);

  return all;
}

async function main() {
  const records = await fetchAllRecords();

  const artists = records
    .map(mapRecord)
    .filter((a) => a.nameKo || a.nameEn)
    .sort((a, b) => b.followers - a.followers);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(artists, null, 2), "utf8");

  console.log(`Synced ${artists.length} artists to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
