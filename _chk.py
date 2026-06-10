import json, os
os.chdir(r'c:\Users\18458\Desktop\555tare最终优化')
d = json.load(open('data/schedule.json', 'r', encoding='utf-8'))
for m in d['matches']:
    no = m.get('matchNo','')
    if '周日' not in no:
        continue
    print(f"{no}: status={m.get('matchStatus','')} full={m.get('fullScore','')} half={m.get('halfScore','')} src={m.get('scoreSource','')}")
