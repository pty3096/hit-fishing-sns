# 히트 HIT — 낚시 SNS 플랫폼

낚시 SNS 플랫폼의 기획·브랜드·UI 자료를 관리하는 저장소입니다.

> 현재 상태: 로컬 개발 앱에서 실제 계정과 글 조황 저장·수정·삭제, 프로필 편집이 가능합니다. 공개 배포는 하지 않았습니다.
> 과거 상세 설계와 확정 디자인 전체 원본은 미확보이며, 복구 문서와 이후 신규 개발 결과를 구분합니다.

## 앱 실행

Node.js 24에서 `npm start`를 실행하고 [로컬 앱](http://127.0.0.1:3000)을 엽니다. 별도 패키지 설치는 필요하지 않습니다. `npm test`로 핵심 동작을 검증합니다.

[실행 방법·현재 기능·미구현 항목](docs/08_LOCAL_APP.md)을 확인해주세요. 사진·댓글·팔로우·신고·차단은 후속 개발 대상입니다. 데이터는 이 PC의 `data/`에 저장되며 GitHub에 올리지 않습니다.

## 자료

- [실제 앱 개발 기반과 검증 기록](docs/08_LOCAL_APP.md)
- [화면 연결 시연](prototype/index.html) · [화면 흐름과 구현 범위](docs/07_SCREEN_FLOW.md)
- [첫 버전 개발 범위·화면 목록](docs/06_MVP_SCOPE.md)
- [마스터 설계서](docs/01_MASTER_PLAN.md)
- [구축 매뉴얼](docs/02_BUILD_GUIDE.md)
- [사용자 매뉴얼](docs/03_USER_MANUAL.md)
- [브랜드·로고](docs/04_BRAND_GUIDE.md)
- [UI 디자인 v1.1](docs/05_UI_DESIGN_v1.1.md)
- [원본 출처 및 누락 목록](docs/SOURCE_STATUS.md)
- [변경 이력](docs/CHANGELOG.md)

## 디자인 파일

[로고 참고 원본](design/logo/reference-logo-crop.png)과 [모바일 홈 참고 원본](design/ui/v1.1/reference-mobile-home.png)을 보존했습니다. 두 이미지는 로고 통일 요청 이전에 첨부된 참고 자료이며, 확정본으로 간주하지 않습니다.

## 실행 상태

`public/`은 실제 앱 화면, `server/`는 API·데이터베이스, `tests/`는 검증 코드입니다. `prototype/`은 이전 단계의 메모리 시연 화면으로 실제 앱과 구분합니다. 공개 배포와 전체 MVP 구현은 아직 완료하지 않았습니다.

