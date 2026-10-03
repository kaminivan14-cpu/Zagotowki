# Czas pracy — UAT

Wspólne źródło: istniejące public.Work_shifts, zachowany unique index
one_open_work_shift(employee_id) WHERE ended_at IS NULL. Nie ma drugiej tabeli sesji.

Migracja 202610040001_worktime.sql dodaje started_from_module, ended_from_module,
updated_at, version oraz indeks employee_id/started_at i started_at/id.
Istniejące sesje zachowują czasy; pochodzenie otrzymują orders, bo wcześniej tylko
Orders tworzyło tę tabelę. Nie odtwarzamy fikcyjnego historycznego audytu.

Work_shift_events jest append-only (RLS, brak grantów klienta, triggery blokujące
UPDATE/DELETE/TRUNCATE). Trigger Work_shifts rejestruje start, zakończenie i korektę,
w tym operacje dotychczasowego orders_command. Zdarzenie zawiera aktora, przed/po,
czas i powód. Korekta wymaga powodu i bieżącej wersji; odrzuca przyszłe czasy,
odwrócone przedziały, nakładanie z inną sesją i zamknięcie niedokończonej pracy Orders.

RPC:
- worktime_current(): wyłącznie własna aktywna sesja.
- worktime_command(start/end/correct, args, UUID): wspólna sesja; używa istniejącego
  dziennika app_private.order_operations z prefiksem worktime. Nie jest to drugi
  mechanizm sesji. Lock pracownika i operacji ma te same klucze co Orders.
- worktime_context(): pracownicy i lokale w zakresie.
- worktime_list(): 100 sesji na stronę, keyset po id.
- worktime_summary(): suma tylko zamkniętych sesji i dni rozpoczęcia.
- worktime_calendar(): liczba sesji i suma według dnia rozpoczęcia.
- worktime_events(): audyt jednej sesji po scope check.
- worktime_export_xml(): backend PostgreSQL XML; automatyczne escaping nazw.

Capabilities:
- worktime.self: role mające wcześniej production.access lub orders.access.
- worktime.access/read.scope/export/correct: administrator i manager.
- worktime.read.all: tylko administrator.
Inne role nie mają panelu. Nie zmieniamy uprawnień Tasks. Manager korzysta
z dotychczasowego zakresu lokalu Orders/Zagotówek: zarówno lokal sesji, jak i
aktualny lokal pracownika muszą być jego lokalem. Granty Tasks nie rozszerzają
tego zakresu. Przeniesiony pracownik może przestać być widoczny dla starego managera;
administrator zachowuje pełny dostęp do historii.

Status jest wyliczany przez backend, bez dodatkowej mutowalnej kolumny:
active / completed / needs_attention. Uwaga: ponad 16 godzin, nakładanie przedziałów
lub przyszłe czasy. Nie ma automatycznego zamykania ani korekt. Brak crona;
status wylicza się przy odczycie.

Daty i godziny: Europe/Warsaw, DD.MM.YYYY, HH:mm. Filtry wybierają dzień rozpoczęcia
sesji, limit jednego zapytania 366 dni. Zmiana przez północ jest jedną sesją i jej
cały czas należy do dnia rozpoczęcia. Różnica timestamptz uwzględnia DST.
Podsumowanie sumuje realne sekundy zamkniętych sesji i zaokrągla sumę w dół do minut.
Aktywne sesje mają czas „do teraz” wyłącznie w UI, bez fałszywego ended_at.
Korekta zachowuje sekundy niezmienionych pól. Niejednoznaczny czas zmiany DST
wymaga jawnego ISO offsetu +01:00/+02:00.

XML: workTimeReport(from,to,timezone) → employee(id)/name/session(id,status,locationId)
→ startDate/startTime/endDate/endTime/workedMinutes. Otwarte sesje mają puste
endDate/endTime/workedMinutes. Bieżące filtry i scope obowiązują również eksport.
Maksymalnie 10 000 sesji w eksporcie; większy zakres wymaga zawężenia.

Integracja:
- Orders zachowuje istniejący start/end zmiany i blokadę UNFINISHED_WORK.
- Zagotówki mają wspólny pasek start/end i wejście do panelu.
- Pierwsze „Rozpocznij” pozycji produkcyjnej wywołuje start wspólnej sesji przed
  istniejącym start_plan_item. Jeśli pozycja zostanie odrzucona, rozpoczęta sesja
  pozostaje widoczna i można ją zakończyć ręcznie.
- Zmiana modułu nie tworzy sesji; kliknięcie start z drugiego modułu zwraca istniejącą.
- Dialog logout: zakończ+wyloguj lub tylko wyloguj. Błąd zakończenia nie wylogowuje.
- Nie zmieniono logout Tasks; moduł Tasks nie rejestruje czasu w tym zakresie.
- UI jest bramkowane capabilities: instalacja bez migracji nie pokazuje nowych wejść.

Wdrożenie tylko feature/orders / Vercel Preview / Supabase meuzkduxttjcuiynsnaa.
Przed migracją: snapshot public/app_private, porównanie Work_shifts i funkcji
z lokalną instalacją wszystkich poprzednich migracji. Stosować tylko nową migrację,
nie zbiorczy db push. Production i main nie zmieniać.

Ręczny smoke:
1. Pracownik w Zagotówkach rozpoczyna pracę, przechodzi do Orders: ta sama sesja.
2. Tylko wyloguj → login na drugim urządzeniu: sesja trwa.
3. Zakończ pracę i wyloguj: zamknięcie raz; niedokończona praca Orders blokuje.
4. Administrator: oba wejścia panelu, lista/kalendarz/podsumowanie, filtry.
5. Manager: brak obcego lokalu/pracowników również w XML.
6. Korekta z powodem; historia pokazuje przed/po; drugi klient dostaje konflikt wersji.
7. Zmiana przez północ i dłuższa niż 16h; aktywna nie zwiększa sumy zamkniętych.
8. Eksport XML, paginacja, strefa Europe/Warsaw.
