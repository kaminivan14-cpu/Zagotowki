/**
 * ZAGOTÓWKI — synchronizacja Google Sheets -> Supabase
 *
 * Arkusze:
 * Polprodukty:
 *   A = ID półproduktu
 *   B = Nazwa półproduktu
 *   C = Gramatura
 *   D = Jednostka gramatury bazowej (g, ml, szt.)
 *
 * Ingredienty:
 *   A = ID półproduktu
 *   B = ID ingredientu
 *   C = Nazwa ingredientu
 *   D = Netto
 *   E = Brutto
 *   F = Jednostka Brutto (g, ml, szt.)
 *
 * Przepływ:
 * Google Sheets -> Apps Script -> Supabase Edge Function -> Supabase
 *
 * Script Properties:
 * SUPABASE_URL
 * SYNC_TOKEN
 */

const PRODUCTS_SHEET = 'Polprodukty';
const INGREDIENTS_SHEET = 'Ingredienty';
const EDGE_FUNCTION = 'sync-products';
const BATCH_SIZE = 500;


/**
 * GŁÓWNA FUNKCJA
 *
 * Tę funkcję uruchamiamy ręcznie lub później z triggera.
 */
// Wywoływana z edytora lub triggera Apps Script, poza tym plikiem.
// eslint-disable-next-line no-unused-vars
function syncAllViaEdge() {
  console.log('=== START SYNCHRONIZACJI ===');

  const config = getConfig();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Odczyt i walidacja danych
  const products = readProducts(spreadsheet);
  const ingredients = readIngredients(spreadsheet);

  // 2. Kontrola duplikatów przed wysłaniem
  assertUniqueProducts(products);
  assertUniqueIngredients(ingredients);

  console.log(`Produkty przygotowane: ${products.length}`);
  console.log(`Ingredienty przygotowane: ${ingredients.length}`);

  // 3. Najpierw produkty.
  // Recipe_ingredients ma powiązanie z Products.
  const productsResult = sendToEdge(config, {
    products: products
  });

  console.log(
    `Products OK: ${JSON.stringify(productsResult)}`
  );

  // 4. Ingredienty partiami
  let syncedIngredients = 0;

  for (let i = 0; i < ingredients.length; i += BATCH_SIZE) {
    const batch = ingredients.slice(i, i + BATCH_SIZE);

    console.log(
      `Wysyłam ingredienty ${i + 1}-${i + batch.length}`
    );

    const result = sendToEdge(config, {
      ingredients: batch
    });

    syncedIngredients += batch.length;

    console.log(
      `Partia OK: ${JSON.stringify(result)}`
    );
  }

  console.log('================================');
  console.log('SYNCHRONIZACJA ZAKOŃCZONA');
  console.log(`Products: ${products.length}`);
  console.log(`Recipe ingredients: ${syncedIngredients}`);
  console.log('================================');
}


/**
 * Odczyt katalogu półproduktów.
 */
function readProducts(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(PRODUCTS_SHEET);

  if (!sheet) {
    throw new Error(
      `Nie znaleziono arkusza "${PRODUCTS_SHEET}"`
    );
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      `Arkusz "${PRODUCTS_SHEET}" nie zawiera danych.`
    );
  }

  const rows = sheet
    .getRange(2, 1, lastRow - 1, 4)
    .getValues();

  const products = [];

  rows.forEach((row, index) => {
    const sheetRow = index + 2;

    // Pusty wiersz pomijamy
    if (
      row[0] === '' &&
      row[1] === '' &&
      row[2] === '' &&
      row[3] === ''
    ) {
      return;
    }

    const externalId = parseInteger(
      row[0],
      `Polprodukty wiersz ${sheetRow}: ID półproduktu`
    );

    const name = String(row[1] || '').trim();

    if (!name) {
      throw new Error(
        `Polprodukty wiersz ${sheetRow}: brak nazwy półproduktu`
      );
    }

    const gramatura = parseRequiredNumber(
      row[2],
      `Polprodukty wiersz ${sheetRow}: gramatura`
    );

    products.push({
      external_id: externalId,
      name: name,
      gramatura: gramatura,
      base_unit: parseRequiredUnit(
        row[3],
        `Polprodukty wiersz ${sheetRow}: jednostka (kolumna D)`
      )
    });
  });

  if (products.length === 0) {
    throw new Error(
      `Arkusz "${PRODUCTS_SHEET}" nie zawiera poprawnych produktów.`
    );
  }

  return products;
}


/**
 * Odczyt receptur.
 */
function readIngredients(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(INGREDIENTS_SHEET);

  if (!sheet) {
    throw new Error(
      `Nie znaleziono arkusza "${INGREDIENTS_SHEET}"`
    );
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const rows = sheet
    .getRange(2, 1, lastRow - 1, 6)
    .getValues();

  const ingredients = [];

  rows.forEach((row, index) => {
    const sheetRow = index + 2;

    // Pusty wiersz pomijamy
    if (
      row[0] === '' &&
      row[1] === '' &&
      row[2] === '' &&
      row[3] === '' &&
      row[4] === '' &&
      row[5] === ''
    ) {
      return;
    }

    const productId = parseInteger(
      row[0],
      `Ingredienty wiersz ${sheetRow}: ID półproduktu`
    );

    const ingredientId = parseInteger(
      row[1],
      `Ingredienty wiersz ${sheetRow}: ID ingredientu`
    );

    const ingredientName = String(row[2] || '').trim();

    if (!ingredientName) {
      throw new Error(
        `Ingredienty wiersz ${sheetRow}: brak nazwy ingredientu`
      );
    }

    ingredients.push({
      product_external_id: productId,
      ingredient_external_id: ingredientId,
      ingredient_name: ingredientName,
      netto: parseNullableNumber(
        row[3],
        `Ingredienty wiersz ${sheetRow}: netto`
      ),
      brutto: parseNullableNumber(
        row[4],
        `Ingredienty wiersz ${sheetRow}: brutto`
      ),
      ingredient_unit: parseRequiredUnit(
        row[5],
        `Ingredienty wiersz ${sheetRow}: jednostka Brutto (kolumna F)`
      )
    });
  });

  return ingredients;
}


/**
 * Konfiguracja z Script Properties.
 *
 * NIE przechowujemy tutaj Supabase Secret Key.
 */
function getConfig() {
  const properties =
    PropertiesService.getScriptProperties();

  const supabaseUrl =
    properties.getProperty('SUPABASE_URL');

  const syncToken =
    properties.getProperty('SYNC_TOKEN');

  if (!supabaseUrl) {
    throw new Error(
      'Brakuje SUPABASE_URL w Script Properties.'
    );
  }

  if (!syncToken) {
    throw new Error(
      'Brakuje SYNC_TOKEN w Script Properties.'
    );
  }

  return {
    supabaseUrl: supabaseUrl.trim().replace(/\/$/, ''),
    syncToken: syncToken.trim()
  };
}


/**
 * Wysyłka do Supabase Edge Function.
 */
function sendToEdge(config, data) {
  const url =
    `${config.supabaseUrl}/functions/v1/${EDGE_FUNCTION}`;

  const payload = {
    sync_token: config.syncToken,
    ...data
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      `Edge Function HTTP ${status}: ${body}`
    );
  }

  try {
    const result = JSON.parse(body);

    if (result.success === false) {
      throw new Error(
        `Edge Function: ${result.error || 'Nieznany błąd'}`
      );
    }

    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Edge Function:')
    ) {
      throw error;
    }

    throw new Error(
      `Edge Function zwróciła niepoprawną odpowiedź: ${body}`
    );
  }
}


/**
 * Jednostka pochodzi wyłącznie z dedykowanej kolumny arkusza.
 * Błąd lub brak zatrzymuje walidację obu arkuszy przed pierwszą wysyłką.
 * Nie zgadujemy jednostek ani nie przeliczamy g <-> ml.
 */
function parseRequiredUnit(value, fieldName) {
  const unit = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (value === null || value === undefined || value === '' ||
      (typeof value === 'string' && !unit)) {
    throw new Error(`${fieldName}: brak jednostki (dozwolone: g, ml, szt.)`);
  }

  if (unit === 'szt' || unit === 'szt.') {
    return 'szt.';
  }

  if (unit === 'g' || unit === 'ml') {
    return unit;
  }

  throw new Error(
    `${fieldName}: nieobsługiwana jednostka "${value}" (dozwolone: g, ml, szt.)`
  );
}


/**
 * ID musi być liczbą całkowitą.
 */
function parseInteger(value, fieldName) {
  if (value === '' || value === null) {
    throw new Error(`${fieldName}: brak wartości`);
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new Error(
      `${fieldName}: niepoprawna wartość "${value}"`
    );
  }

  return number;
}


/**
 * Wymagana liczba.
 */
function parseRequiredNumber(value, fieldName) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    throw new Error(`${fieldName}: brak wartości`);
  }

  const number = normalizeNumber(value);

  if (!Number.isFinite(number)) {
    throw new Error(
      `${fieldName}: niepoprawna wartość "${value}"`
    );
  }

  return number;
}


/**
 * Opcjonalna liczba.
 * Pusta komórka -> NULL w Supabase.
 */
function parseNullableNumber(value, fieldName) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = normalizeNumber(value);

  if (!Number.isFinite(number)) {
    throw new Error(
      `${fieldName}: niepoprawna wartość "${value}"`
    );
  }

  return number;
}


/**
 * Obsługuje zarówno:
 * 1.5
 * jak i
 * 1,5
 */
function normalizeNumber(value) {
  if (typeof value === 'number') {
    return value;
  }

  return Number(
    String(value)
      .trim()
      .replace(/\s/g, '')
      .replace(',', '.')
  );
}


/**
 * Jeden external_id = jeden produkt.
 */
function assertUniqueProducts(products) {
  const ids = new Set();

  products.forEach(product => {
    if (ids.has(product.external_id)) {
      throw new Error(
        `Duplikat ID półproduktu: ${product.external_id}`
      );
    }

    ids.add(product.external_id);
  });
}


/**
 * Jeden ingredient może wystąpić tylko raz
 * w recepturze danego półproduktu.
 */
function assertUniqueIngredients(ingredients) {
  const keys = new Set();

  ingredients.forEach(item => {
    const key =
      `${item.product_external_id}:${item.ingredient_external_id}`;

    if (keys.has(key)) {
      throw new Error(
        `Duplikat receptury: półprodukt ${item.product_external_id}, ` +
        `ingredient ${item.ingredient_external_id}`
      );
    }

    keys.add(key);
  });
}
