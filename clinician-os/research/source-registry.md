# Реестр источников мониторинга (живая таблица)

> Курируемый список площадок для Контура A. Дизайн и режимы —
> `../monitoring-and-digest.md`. Меняет `status` только админ (Степан).
> Стартовый список — черновик, ждёт утверждения. Обновлять с датой.

| id | Название | kind | scope | access | trust | методики | статус |
|---|---|---|---|---|---|---|---|
| psyjournals | psyjournals.ru (МГППУ) | journal | ru | open | high | все патопсих. | active |
| cyberleninka | КиберЛенинка | repository | ru | open | medium | все | active |
| minzdrav_cr | Клин. рекомендации Минздрава | guideline_body | ru | open | high | когнитивные (пороги) | active |
| psystudy | Психологические исследования | journal | ru | open | medium | все | active |
| korsakov | Журнал неврологии и психиатрии им. Корсакова | journal | ru | abstract_only | high | клин. | active |
| bekhterev | Обозрение психиатрии им. Бехтерева | journal | ru | abstract_only | high | клин. | active |
| elibrary | eLibrary.ru / РИНЦ | index | ru | abstract_only | high | все | active |
| pubmed | PubMed / PMC | index | intl | open | high | TMT, RAVLT, MMSE… | active |
| scholar | Google Scholar | discovery | intl | open | — | обнаружение | active |

## Журнал изменений реестра

- 2026-07 — **реестр утверждён Степаном целиком (9 площадок → active)**;
  его акцент: PubMed и КиберЛенинка — «самые норм из доступных», остальные
  тоже хороши. Ритм утверждён: квартальный дайджест + горячие алерты;
  квартальный триггер прогона — включён; продукт-дайджест — обе версии
  (цена платной — обсуждается отдельно).
- 2026-07 — создан стартовый черновик (9 площадок), пилот-прогон по Шульте
  выявил, что открытые источники (КиберЛенинка, psyjournals, PMC, Минздрав) —
  приоритет обхода; подписные дают только сигнал.
