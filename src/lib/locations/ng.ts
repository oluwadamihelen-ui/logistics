/**
 * Nigerian states and their main cities / towns / Lagos-Abuja districts. This is a starter list used to fill the
 * state → city drop-downs; companies add anything missing from Hubs & branches → Cities (stored per company).
 */
export const NG_LOCATIONS: Record<string, string[]> = {
  Abia: ["Aba", "Umuahia", "Arochukwu", "Ohafia", "Bende", "Isiala Ngwa", "Ukwa"],
  Adamawa: ["Yola", "Mubi", "Jimeta", "Numan", "Ganye", "Guyuk", "Michika"],
  "Akwa Ibom": ["Uyo", "Eket", "Ikot Ekpene", "Oron", "Abak", "Ikot Abasi", "Itu"],
  Anambra: ["Awka", "Onitsha", "Nnewi", "Ekwulobia", "Agulu", "Ihiala", "Aguata"],
  Bauchi: ["Bauchi", "Azare", "Misau", "Jama'are", "Katagum", "Ningi", "Darazo"],
  Bayelsa: ["Yenagoa", "Brass", "Ogbia", "Sagbama", "Nembe", "Kolokuma"],
  Benue: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala", "Vandeikya", "Oju", "Adoka"],
  Borno: ["Maiduguri", "Bama", "Biu", "Dikwa", "Gwoza", "Konduga", "Monguno"],
  "Cross River": ["Calabar", "Ikom", "Ogoja", "Obudu", "Akamkpa", "Ugep", "Obanliku"],
  Delta: ["Asaba", "Warri", "Sapele", "Ughelli", "Agbor", "Effurun", "Kwale", "Abraka", "Ogwashi-Uku"],
  Ebonyi: ["Abakaliki", "Afikpo", "Onueke", "Ezzamgbo", "Ishiagu", "Edda"],
  Edo: ["Benin City", "Auchi", "Ekpoma", "Uromi", "Igarra", "Irrua", "Sabongida-Ora"],
  Ekiti: ["Ado-Ekiti", "Ikere-Ekiti", "Ijero-Ekiti", "Oye-Ekiti", "Ikole-Ekiti", "Omuo-Ekiti", "Efon-Alaaye"],
  Enugu: ["Enugu", "Nsukka", "Oji River", "Agbani", "Awgu", "Udi", "Ninth Mile"],
  FCT: ["Abuja", "Garki", "Wuse", "Maitama", "Asokoro", "Gwarinpa", "Jabi", "Kubwa", "Lugbe", "Utako", "Gwagwalada", "Kuje", "Bwari", "Nyanya", "Karu", "Life Camp", "Apo", "Katampe", "Wuye", "Dutse", "Lokogoma", "Durumi", "Jahi"],
  Gombe: ["Gombe", "Kaltungo", "Billiri", "Dukku", "Bajoga", "Kumo"],
  Imo: ["Owerri", "Orlu", "Okigwe", "Mbaise", "Oguta", "Mbieri", "Ohaji"],
  Jigawa: ["Dutse", "Hadejia", "Kazaure", "Gumel", "Ringim", "Birnin Kudu", "Kiyawa"],
  Kaduna: ["Kaduna", "Zaria", "Kafanchan", "Kagoro", "Sabon Tasha", "Soba", "Birnin Gwari"],
  Kano: ["Kano", "Wudil", "Gaya", "Rano", "Bichi", "Dawakin Tofa", "Kumbotso"],
  Katsina: ["Katsina", "Daura", "Funtua", "Malumfashi", "Dutsin-Ma", "Kankia", "Mani"],
  Kebbi: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru", "Jega", "Koko", "Bagudo"],
  Kogi: ["Lokoja", "Okene", "Kabba", "Idah", "Ajaokuta", "Anyigba", "Dekina"],
  Kwara: ["Ilorin", "Offa", "Omu-Aran", "Jebba", "Patigi", "Lafiagi", "Share"],
  Lagos: ["Ikeja", "Lekki", "Victoria Island", "Ikoyi", "Yaba", "Surulere", "Ajah", "Maryland", "Ikorodu", "Festac Town", "Apapa", "Oshodi", "Mushin", "Gbagada", "Magodo", "Ogudu", "Ojota", "Isolo", "Agege", "Alimosho", "Ipaja", "Badagry", "Epe", "Ojo", "Amuwo-Odofin", "Ilupeju", "Palmgrove", "Ojodu", "Berger", "Egbeda", "Idimu", "Iyana Ipaja", "Sangotedo", "Chevron", "Ikate", "Oniru", "Oworonshoki", "Somolu", "Bariga", "Anthony", "Ketu", "Mile 12", "Lagos Island", "Marina", "Obalende", "Ebute Metta", "Ijora", "Satellite Town", "Abule Egba", "Ejigbo", "Lakowe", "Abraham Adesanya", "Victoria Garden City"],
  Nasarawa: ["Lafia", "Keffi", "Karu", "Akwanga", "Nasarawa", "Mararaba", "Doma"],
  Niger: ["Minna", "Bida", "Suleja", "Kontagora", "Lapai", "New Bussa", "Mokwa"],
  Ogun: ["Abeokuta", "Ijebu-Ode", "Sagamu", "Ota", "Ilaro", "Ifo", "Mowe", "Sango Ota", "Ikenne", "Ijebu Igbo", "Agbara", "Ibafo", "Redemption Camp"],
  Ondo: ["Akure", "Ondo", "Owo", "Ikare", "Okitipupa", "Ore", "Ilara-Mokin"],
  Osun: ["Osogbo", "Ile-Ife", "Ilesa", "Ede", "Iwo", "Ikirun", "Ila-Orangun"],
  Oyo: ["Ibadan", "Ogbomosho", "Oyo", "Iseyin", "Saki", "Igboho", "Eruwa", "Moniya", "Challenge", "Bodija"],
  Plateau: ["Jos", "Bukuru", "Pankshin", "Shendam", "Vom", "Barkin Ladi", "Langtang"],
  Rivers: ["Port Harcourt", "Obio-Akpor", "Bonny", "Okrika", "Eleme", "Ahoada", "Omoku", "Bori", "Rumuokoro", "Trans-Amadi", "Rumuola", "Choba"],
  Sokoto: ["Sokoto", "Tambuwal", "Gwadabawa", "Wurno", "Illela", "Bodinga", "Goronyo"],
  Taraba: ["Jalingo", "Wukari", "Bali", "Takum", "Mutum Biyu", "Gembu", "Zing"],
  Yobe: ["Damaturu", "Potiskum", "Gashua", "Nguru", "Geidam", "Gujba"],
  Zamfara: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka", "Tsafe", "Gummi", "Bungudu"],
};

export const NG_STATES = Object.keys(NG_LOCATIONS).sort((a, b) => a.localeCompare(b));

const norm = (s: string) => s.trim().toLowerCase();

/** Built-in cities for a state (matched case-insensitively), or [] if the state is unknown. */
export function builtInCities(state: string): string[] {
  const key = NG_STATES.find((s) => norm(s) === norm(state));
  return key ? NG_LOCATIONS[key] : [];
}

/** Merge built-in and company-added cities for a state, de-duplicated and sorted. */
export function citiesFor(state: string, custom: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const c of [...builtInCities(state), ...custom]) if (!seen.has(norm(c))) seen.set(norm(c), c);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
