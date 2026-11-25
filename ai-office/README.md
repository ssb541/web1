# 🏢 나의 AI 사무실

픽셀 AI 직원을 채용하고 업무를 지시하면, 직원이 자리에 앉아 실제로 일하고 결과를 자기 작업폴더에 저장합니다.

## 실행
```bash
cd ai-office
cp .env.example .env     # ANTHROPIC_API_KEY 입력 (없으면 데모 모드)
node server.js           # Node 18+ , 설치할 패키지 없음
# http://127.0.0.1:3000
```

- 직원별 결과 파일: `workspace/<직원ID>/날짜-업무-xxxx.md`
- 상태 저장: `data/state.json`
- 직원은 동시에 업무 1개씩 처리하고, 나머지는 대기열에 쌓입니다.
- 서버는 기본적으로 내 컴퓨터(127.0.0.1)에서만 접속됩니다. API 키가 사용되므로 외부 공개는 하지 마세요.
