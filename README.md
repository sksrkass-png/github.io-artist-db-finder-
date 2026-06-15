# Artist DB Finder

Airtable 기반 아티스트 DB를 GitHub Pages에서 검색/필터/추천 소팅으로 보기 위한 프로토타입입니다.

## Upload guide
압축을 풀고 `index.html`, `data`, `scripts`, `.github` 폴더를 GitHub 저장소의 루트 위치에 업로드하세요.

## V3 update
- TEST C-TOTAL.csv 기준 샘플 `data/artists.json` 반영
- `대표작 이미지` 필드의 여러 첨부 이미지/URL을 3개까지 작품 프리뷰로 사용
- Airtable Attachment 배열과 CSV attachment 문자열 모두 URL 파싱 지원
- 카드 마우스오버 3 works / 작품 클릭 팝업 로직 호환성 개선
