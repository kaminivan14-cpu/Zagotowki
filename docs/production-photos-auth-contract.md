# Zdjęcia produkcyjne — kontrakt z feature/auth

## Zakres tego etapu

Komponenty ProductionPhotoDialog i ProductionPhotoViewer są niezależne, montowane
na czas otwarcia. Nie są jeszcze podpięte do ProductionScreen ani App. Istniejące
GOTOWE/RPC działa bez zmian. Zdjęcie jest opcjonalne dla starych i nowych zakończeń.

Dialog przyjmuje productName, onClose, async onConfirm(blob) i async onSkip().
onConfirm zatwierdza wariant ze zdjęciem, onSkip jawnie potwierdza zakończenie bez
zdjęcia. Anuluj/Escape tylko zamykają dialog, nie kończą pozycji. Brak callbacku
blokuje wyłącznie odpowiadającą mu akcję do czasu integracji. Błąd uploadu pokazuje
Spróbuj ponownie i pozostawia Pomiń zdjęcie dostępne. Nie następuje automatyczne
przejście do kończenia bez zdjęcia. submitProductionPhotoChoice rozdziela te ścieżki.
Niepowodzenie pominięcia również pozostawia dialog otwarty. Blob jest JPEG, maks. dłuższy bok 1600 px,
jakość 0.82, maks. 5 MiB; źródło maks. 25 MiB. HEIC/HEIF/AVIF wymagają dekodera
przeglądarki, w przeciwnym razie użytkownik otrzyma informację o wyborze JPEG.
Anulowanie/ponowny wybór są dostępne przed zapisem; podczas przygotowania/zapisu
kontrolki i Escape są blokowane. Odmontowanie nie anuluje zapisu serwerowego.
Podglądy lokalne używają zwalnianych object URL, nie bazy danych.

Viewer przyjmuje productName, onClose i stabilny callback loadSignedUrl().
Przy błędzie można pobrać nowy URL. Adresy są krótkotrwałe (60 sekund), nie należy
zapisywać ich w bazie, sessionStorage ani logach. Native dialog zapewnia modalność,
obsługę fokusu i Escape; komponenty wymagają przeglądarki wspierającej showModal.

productionPhotos.js przyjmuje istniejący klient Supabase z sesją feature/auth.
getUser jest tylko kontrolą UX, nigdy zamiennikiem RLS. Nie ma PIN fallbacku,
p_requester_id, service-role ani publicznych URL. Upload przesyła wyłącznie obiekt;
nie zapisuje metadanych, nie wywołuje complete_plan_item. Zwrócone dane nie są
potwierdzeniem zakończenia produkcji. photoId (crypto.randomUUID) powinien być
wygenerowany raz dla próby operacji i zachowany przez integrację do ponowienia.

## Oczekiwane dane od feature/auth

- Zweryfikowana sesja Supabase i auth.uid() różne od NULL po stronie bazy.
- Jednoznaczne serwerowe mapowanie auth.uid() na aktywny rekord pracownika.
  Nazwę pola/funkcji dostarcza Paweł; ten branch nie dodaje Employees.auth_user_id.
- Aktualne employee ID, rola i location_id odczytane z bazy, a nie payloadu klienta.
- Uzgodniona reguła wykonawcy: employee działa we własnym lokalu. Jeśli wymagamy
  własności rozpoczętej pracy, backend musi wiarygodnie zapisać ją przy START;
  obecny audytowany START tego nie robi. Nie rekonstruować jej z p_requester_id.
- Uzgodniona sygnatura autoryzowanego kończenia pozycji bez zaufania do requester ID.

## Migracja i polityki

supabase/migrations/20260923000100_production_photos.sql to jednorazowa migracja,
nie skrypt do wielokrotnego odpalania. Nie została uruchomiona ani przetestowana
na bazie. Tworzy Production_photos, FK do Plan_items (RESTRICT), indeks po pozycji,
unikalną ścieżkę <plan_item_id>/<photo_id>.jpg oraz nullable uploaded_by uuid.
Nie dodaje powiązania do Employees ani własnego modelu tożsamości.
Bucket production-photos jest prywatny, JPEG, maks. 5 MiB. Istniejący bucket
tej nazwy zostanie ustawiony jako prywatny z tymi limitami; obiekty nie są usuwane.

Obecnie tabela nie daje grantów/policies klientom. Restrykcyjna policy
production_photos_pending_auth blokuje anon/authenticated wyłącznie w tym bucketcie,
także gdy inne permissive policies są szerokie. Inne buckety pozostają bez zmian.

Po merge należy w osobnej migracji integracyjnej:
1. Zdefiniować kontrole zdjęć na podstawie mapowania Auth, planu i pracownika.
2. Nadać wyłącznie potrzebne granty i policies. Nie pozwalać klientowi samodzielnie
   tworzyć wiarygodnych metadanych ani podawać uploaded_by/created_at.
3. Zastąpić barierę pending_auth politykami obejmującymi również zabezpieczenie
   przed istniejącymi szerokimi permissive policies. Anon nadal bez dostępu.

Docelowo INSERT obiektu: aktywny uprawniony wykonawca, właściwy lokal, istniejąca
rozpoczęta i niezakończona pozycja w aktywnym planie na właściwy dzień. Sprawdzić
całą ścieżkę, nie tylko jej prefiks. Powiązać obiekt/wystawcę z auth.uid() i
kontrolować rozszerzenie, MIME oraz rozmiar po stronie serwera. JPEG MIME klienta
nie dowodzi zawartości. Brak ogólnego upsert/UPDATE/DELETE obiektów zakończonych.

SELECT tabeli i obiektów: manager/su-chef tylko własny lokal, administrator wszystkie;
employee w swoim lokalu zgodnie z uzgodnionym zakresem wykonania. Te same zasady
muszą działać dla podpisywania URL. Relacja lokalu: zdjęcie → Plan_items → Plans;
nie duplikować location_id w zdjęciu. Podpisany URL jest krótkotrwałym uprawnieniem
posiadacza i może działać do wygaśnięcia nawet po odebraniu roli.

## Opcjonalne zdjęcie — kontrakt zakończenia po integracji

Obie ścieżki są poprawne: zakończenie ze zdjęciem i zakończenie bez zdjęcia.
Brak zdjęcia nie może blokować produkcji. Nie dodawać triggera ani warunku,
który wymaga Production_photos dla gotowej pozycji, starej lub nowej.

Po wyborze zdjęcia: upload → serwerowe potwierdzenie zdjęcia i zakończenie w jednej
transakcji PostgreSQL → ponowny odczyt pozycji. onConfirm czeka na całość.
Storage i PostgreSQL nie tworzą wspólnej transakcji obejmującej bajty zdjęcia.
Po błędzie użytkownik może ponowić, wybrać inny plik, anulować lub jawnie pominąć.

Po Pomiń zdjęcie: onSkip wywołuje autoryzowane zakończenie bez zdjęcia. Nie wymaga
uploadu, podpisanego URL ani dostępu do Storage. Błąd Storage nie może blokować tej
ścieżki. Błąd samego kończenia (np. brak połączenia lub uprawnień) trzeba pokazać;
nie wolno pozornie potwierdzać operacji, której serwer nie wykonał.

Docelowe RPC przyjmuje plan_item_id oraz opcjonalne photo_id (NULL dla pominięcia).
W obu wariantach ustala auth.uid(), sprawdza uprawnienia/aktywność/lokal i wszystkie
dotychczasowe warunki complete_plan_item. Blokuje plan i pozycję w zgodnej kolejności.
Tylko gdy podano photo_id, wyprowadza ścieżkę, sprawdza rzeczywistą obecność obiektu,
jego powiązanie z wykonawcą/pozycją oraz wymagane metadane, po czym atomowo dodaje
Production_photos (uploaded_by = auth.uid()) i kończy Plan_item. Przy NULL kończy
bez wstawiania pustego rekordu zdjęcia. Sam sukces uploadu nie oznacza zakończenia.

Przyszłe photo_required: regułę można dodać w tym wspólnym punkcie finalizacji,
rozstrzygając ją serwerowo dla produktu/lokalu/globalnie, a UI dostanie wynik reguły.
Wówczas ten sam dialog można rozszerzyć o warunkowe ukrycie pominięcia. Teraz nie
implementujemy pola, konfiguracji ani mechanizmu photo_required. Obecnie brak zdjęcia
jest dozwolony dla wszystkich ról mogących kończyć produkcję.

Błąd sieci może oznaczać, że serwer zapisał obiekt lub zakończył pozycję mimo braku
odpowiedzi. Ponowienie z tym samym photo_id ma zweryfikować rezultat i być
idempotentne, nie tworzyć kolejnego zdjęcia. Obecny helper celowo używa upsert:false;
konflikt już istniejącego obiektu nie jest automatycznie traktowany jako sukces.
Integracja musi rozstrzygnąć go serwerowo. Nie usuwać automatycznie obiektu po
niepewnym wyniku finalizacji — mógł zostać przypięty do zakończonej pozycji.
Po pominięciu zdjęcia po nieudanym uploadzie również może pozostać obiekt.
Jeżeli poprzednie zakończenie już się udało, onSkip powinien idempotentnie zwrócić
aktualny wynik, bez usuwania poprawnie przypiętego zdjęcia.
Porzucone obiekty powinno sprzątać kontrolowane zadanie serwerowe po okresie
karencji i sprawdzeniu braku referencji oraz trwającej finalizacji.

## Weryfikacja przed włączeniem

Przygotowano lekkie testy helperów bez sieci, przeglądarki i bazy. Nie weryfikują
Canvas, wyglądu modali ani wykonania SQL. Przed włączeniem potrzebna będzie
kontrola na telefonie oraz integracyjna autoryzacji: inny lokal, wygasła sesja,
błąd uploadu i późniejsze pominięcie, ponowienie, zakończenie bez zdjęcia oraz
stare i nowe zakończone pozycje bez zdjęć. Ten etap tych testów nie uruchamia.
