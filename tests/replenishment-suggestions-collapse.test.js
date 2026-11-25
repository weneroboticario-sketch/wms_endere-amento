import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('sugestoes de abastecimento podem ser recolhidas sem ocultar fila operacional',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const panel=html.slice(html.indexOf('id="replenishmentSuggestionsPanel"'),html.indexOf('id="replenishmentSuggestionsStatus"')+180);
 assert.match(panel,/<details class="replenishment-suggestions-collapse" id="replenishmentSuggestionsCollapse">/);
 assert.match(panel,/<summary class="replenishment-suggestions-summary"/);
 assert.doesNotMatch(panel,/<details[^>]*\sopen(?:\s|>|=)/);
 assert.match(panel,/id="replenishmentSuggestionsList"/);
 assert.match(panel,/id="refreshReplenishmentSuggestionsButton"/);
 assert.match(panel,/data-replenishment-suggestion-filter/);
 assert.ok(html.indexOf('id="replenishmentList"')<html.indexOf('id="replenishmentSuggestionsPanel"'));
});
