(function () {
  const targetId = 'displayName';
  const lang = navigator.language.trim().substring(0,2);
  var helpText = null;
  switch(lang){
    default: helpText='To set an icon, go to font awesome';
    break;
    case "de": helpText='Um ein Symbol zu setzen, gehe zu <a href="https://fontawesome.com/icons">https://fontawesome.com/icons</a>, wähle ein kostenloses Symbol, kopiere dessen vollständigen Klassennamen (z. B. "fa-regular fa-bookmark") und füge ihn in geschwungenen Klammern in die Beschreibung ein: {fa-regular fa-bookmark}.';
    break;
    case "it": helpText="Per impostare un'icona, vai su <a href='https://fontawesome.com/icons'>https://fontawesome.com/icons</a>, seleziona un'icona gratuita, copia il nome della classe completo (es. 'fa-regular fa-bookmark') e aggiungilo tra parentesi graffe nella descrizione: {fa-regular fa-bookmark}."
  }

  const targetElement = document.getElementById(targetId);
  if (!targetElement) {
    return;
  }

  const helpCell = createHelpCell(helpText);
  appendHelpCellAfterLabel(targetElement, helpCell);
})();

function createHelpCell(text) {
  const td = document.createElement('td');
  td.innerHTML = text;
  return td;
}

function appendHelpCellAfterLabel(labelElement, cellElement) {
  const parent = labelElement.parentNode;
  const grandparent = parent?.parentNode;
  if (!grandparent) return;
  grandparent.appendChild(cellElement);
}