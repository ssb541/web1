# PSD 밑색 Flatting

프로크리에이트에서 내보낸 `.psd` 를 브라우저에서 열어, 선택한 선화 레이어 **바로 아래**에
`밑색_Flat` 레이어를 만들어 채운 뒤 `.psd` 로 다시 저장하는 정적 웹 앱입니다.
서버 업로드 없음 · 빌드 없음 · GitHub Pages(`/psd-flatting/`)에 그대로 배포 가능.

- 라이브러리: [ag-psd](https://github.com/Agamnentzar/ag-psd) (`vendor/ag-psd.js`, MIT)
- `fill.js`: 영역 분리 알고리즘 (틈새 막기 → 연결 영역 라벨링 → 선 아래로 Expand)
- 기존 레이어는 읽은 픽셀(imageData) 그대로 다시 쓰므로 이름·순서·투명도·블렌드 모드·해상도가 유지됩니다.

## 테스트
```
node test/fill.test.js                                  # 알고리즘
node test/make-psd.js in.psd                            # 샘플 PSD 생성 (ag-psd 필요)
python3 -m http.server 8765 &                           # 정적 서버
node test/e2e.js in.psd http://localhost:8765/index.html out   # Playwright e2e
```

## 한계
- 레이어 마스크·레이어 스타일·조정 레이어는 화면 미리보기에 반영되지 않습니다(저장 시에는 ag-psd 가 파싱한 만큼 보존).
- 8비트 RGB PSD 기준입니다.
