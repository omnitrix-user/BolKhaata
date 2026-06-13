// Trilingual strings: Hindi (primary) / Kannada / English. Each entry { hi, kn, en }.

export const LANGS = ['hi', 'kn', 'en']
export const LANG_LABEL = { hi: 'हिंदी', kn: 'ಕನ್ನಡ', en: 'English' }
// Pill shows the NEXT language to switch to.
export const nextLang = (l) => LANGS[(LANGS.indexOf(l) + 1) % LANGS.length]
// BCP-47 tags for the Web Speech API.
export const SPEECH_LANG = { hi: 'hi-IN', kn: 'kn-IN', en: 'en-IN' }

export const STR = {
  appName: { hi: 'बोलखाता', kn: 'ಬೋಲ್‌ಖಾತಾ', en: 'BolKhaata' },
  tagline: { hi: 'आपका खाता, आपकी आवाज़', kn: 'ನಿಮ್ಮ ಖಾತೆ, ನಿಮ್ಮ ಧ್ವನಿ', en: 'Your ledger, your voice' },

  // nav
  navHome: { hi: 'होम', kn: 'ಮುಖಪುಟ', en: 'Home' },
  navKhata: { hi: 'खाता', kn: 'ಖಾತೆ', en: 'Khata' },
  navBill: { hi: 'बिल', kn: 'ಬಿಲ್', en: 'Invoices' },
  navSettings: { hi: 'सेटिंग', kn: 'ಸೆಟ್ಟಿಂಗ್ಸ್', en: 'Settings' },

  // onboarding
  chooseMode: { hi: 'अपना काम चुनें', kn: 'ನಿಮ್ಮ ವ್ಯಾಪಾರ ಆಯ್ಕೆಮಾಡಿ', en: 'Choose your business' },
  streetVendor: { hi: 'रेहड़ी / ठेला', kn: 'ಬೀದಿ ವ್ಯಾಪಾರಿ', en: 'Street Vendor' },
  streetVendorDesc: { hi: 'बिना GST, झटपट हिसाब', kn: 'GST ಇಲ್ಲ, ತ್ವರಿತ ಬಿಲ್', en: 'No GST, quick billing' },
  singleShop: { hi: 'एक दुकान', kn: 'ಒಂದು ಅಂಗಡಿ', en: 'Single Shop' },
  singleShopDesc: { hi: 'एक दुकान, GST के साथ', kn: 'ಒಂದು ಅಂಗಡಿ, GST ಸಹಿತ', en: 'One shop, with GST' },
  multiShop: { hi: 'कई दुकानें', kn: 'ಹಲವು ಅಂಗಡಿಗಳು', en: 'Multiple Shops' },
  multiShopDesc: { hi: 'कई दुकानें, GST के साथ', kn: 'ಹಲವು ಅಂಗಡಿಗಳು, GST ಸಹಿತ', en: 'Many shops, with GST' },
  gstRate: { hi: 'GST दर (%)', kn: 'GST ದರ (%)', en: 'GST rate (%)' },
  upiId: { hi: 'UPI ID (पेमेंट QR के लिए)', kn: 'UPI ID (ಪಾವತಿ QR)', en: 'UPI ID (for payment QR)' },
  login: { hi: 'लॉगिन', kn: 'ಲಾಗಿನ್', en: 'Login' },
  register: { hi: 'नई दुकान बनाएं', kn: 'ಹೊಸ ಅಂಗಡಿ ರಚಿಸಿ', en: 'Create shop' },
  haveAccount: { hi: 'पहले से दुकान है? लॉगिन करें', kn: 'ಈಗಾಗಲೇ ಅಂಗಡಿ ಇದೆಯೇ? ಲಾಗಿನ್ ಮಾಡಿ', en: 'Already have a shop? Login' },
  needAccount: { hi: 'नई दुकान? यहाँ बनाएं', kn: 'ಹೊಸ ಅಂಗಡಿ? ಇಲ್ಲಿ ರಚಿಸಿ', en: 'New shop? Register here' },
  shopName: { hi: 'दुकान का नाम', kn: 'ಅಂಗಡಿ ಹೆಸರು', en: 'Shop name' },
  ownerName: { hi: 'मालिक का नाम', kn: 'ಮಾಲೀಕರ ಹೆಸರು', en: 'Owner name' },
  phone: { hi: 'मोबाइल नंबर', kn: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ', en: 'Mobile number' },
  pin: { hi: '4 अंकों का PIN', kn: '4 ಅಂಕಿಯ PIN', en: '4-digit PIN' },
  gstin: { hi: 'GSTIN (वैकल्पिक)', kn: 'GSTIN (ಐಚ್ಛಿಕ)', en: 'GSTIN (optional)' },
  address: { hi: 'दुकान का पता', kn: 'ಅಂಗಡಿ ವಿಳಾಸ', en: 'Shop address' },
  continue: { hi: 'आगे बढ़ें', kn: 'ಮುಂದುವರಿಯಿರಿ', en: 'Continue' },
  back: { hi: 'पीछे', kn: 'ಹಿಂದೆ', en: 'Back' },

  // voice
  tapToSpeak: { hi: 'बोलने के लिए दबाएं', kn: 'ಮಾತನಾಡಲು ಒತ್ತಿರಿ', en: 'Tap to speak' },
  listening: { hi: 'सुन रहे हैं…', kn: 'ಕೇಳುತ್ತಿದೆ…', en: 'Listening…' },
  tapToStop: { hi: 'रोकने के लिए दबाएं', kn: 'ನಿಲ್ಲಿಸಲು ಒತ್ತಿರಿ', en: 'Tap to stop' },
  processing: { hi: 'समझ रहे हैं…', kn: 'ಅರ್ಥಮಾಡಿಕೊಳ್ಳುತ್ತಿದೆ…', en: 'Understanding…' },
  micHint: { hi: 'जैसे: "सुरेश को दो सौ रुपये उधार"', kn: 'ಉದಾ: "Suresh ಗೆ 200 ರೂಪಾಯಿ ಸಾಲ"', en: 'e.g. "Suresh ko 200 rupaye udhaar"' },
  micDenied: { hi: 'माइक की अनुमति नहीं मिली', kn: 'ಮೈಕ್ ಅನುಮತಿ ಸಿಗಲಿಲ್ಲ', en: 'Microphone access denied' },
  micUnsupported: { hi: 'इस ब्राउज़र में आवाज़ बंद — Chrome इस्तेमाल करें या टाइप करें', kn: 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಇಲ್ಲ — Chrome ಬಳಸಿ ಅಥವಾ ಟೈಪ್ ಮಾಡಿ', en: 'Voice is off in this browser — use Chrome or type' },
  noAudio: { hi: 'आवाज़ नहीं आई, फिर कोशिश करें', kn: 'ಧ್ವನಿ ಸಿಗಲಿಲ್ಲ, ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', en: 'No audio captured, try again' },
  notUnderstood: { hi: 'समझ नहीं आया, फिर बोलें', kn: 'ಅರ್ಥವಾಗಲಿಲ್ಲ, ಮತ್ತೆ ಹೇಳಿ', en: "Didn't catch that, try again" },
  typeInstead: { hi: 'या टाइप करें', kn: 'ಅಥವಾ ಟೈಪ್ ಮಾಡಿ', en: 'or type instead' },
  reviewHeading: { hi: 'आपने क्या कहा?', kn: 'ನೀವು ಏನು ಹೇಳಿದಿರಿ?', en: 'What you said' },
  reviewHint: { hi: 'ज़रूरत हो तो ठीक करें, फिर आगे बढ़ें', kn: 'ಬೇಕಿದ್ದರೆ ಸರಿಪಡಿಸಿ, ನಂತರ ಮುಂದುವರಿ', en: 'Edit if needed, then continue' },
  confirmText: { hi: 'सही है, आगे बढ़ें', kn: 'ಸರಿ, ಮುಂದುವರಿ', en: 'Confirm' },
  reRecord: { hi: 'फिर बोलें', kn: 'ಮತ್ತೆ ಹೇಳಿ', en: 'Re-record' },
  voiceTitle: { hi: 'बोलिए', kn: 'ಮಾತನಾಡಿ', en: 'Speak' },
  actionQuestion: { hi: 'इसका क्या करें?', kn: 'ಇದಕ್ಕೆ ಏನು ಮಾಡಬೇಕು?', en: 'What would you like to do?' },
  actionInvoice: { hi: 'बिल बनाएं', kn: 'ಬಿಲ್ ರಚಿಸಿ', en: 'Generate Invoice' },
  actionKhata: { hi: 'खाते में डालें', kn: 'ಖಾತೆಗೆ ಸೇರಿಸಿ', en: 'Add to Khata' },
  whichCustomer: { hi: 'कौन सा ग्राहक?', kn: 'ಯಾವ ಗ್ರಾಹಕ?', en: 'Which customer?' },
  newCustomer: { hi: '+ नया ग्राहक बनाएं', kn: '+ ಹೊಸ ಗ್ರಾಹಕ', en: '+ New customer' },
  opened: { hi: 'खोल दिया', kn: 'ತೆರೆಯಲಾಗಿದೆ', en: 'Opened' },

  // confirm
  confirmEntry: { hi: 'सही है?', kn: 'ಸರಿಯೇ?', en: 'Confirm entry' },
  credit: { hi: 'उधार', kn: 'ಸಾಲ', en: 'Credit' },
  payment: { hi: 'जमा', kn: 'ಜಮಾ', en: 'Payment' },
  customer: { hi: 'ग्राहक', kn: 'ಗ್ರಾಹಕ', en: 'Customer' },
  amount: { hi: 'रकम', kn: 'ಮೊತ್ತ', en: 'Amount' },
  note: { hi: 'नोट', kn: 'ಟಿಪ್ಪಣಿ', en: 'Note' },
  unknownCustomer: { hi: 'नाम भरें', kn: 'ಹೆಸರು ಭರ್ತಿ ಮಾಡಿ', en: 'Enter name' },
  save: { hi: 'खाते में लिखो', kn: 'ಖಾತೆಗೆ ಸೇರಿಸಿ', en: 'Save to khata' },
  cancel: { hi: 'रद्द करें', kn: 'ರದ್ದುಮಾಡಿ', en: 'Cancel' },
  done: { hi: 'हो गया', kn: 'ಆಯಿತು', en: 'Done' },
  saved: { hi: 'हो गया!', kn: 'ಆಯಿತು!', en: 'Done!' },
  newBalance: { hi: 'नया हिसाब', kn: 'ಹೊಸ ಬಾಕಿ', en: 'New balance' },

  // ledger
  khataLedger: { hi: 'खाता बही', kn: 'ಖಾತೆ ಪುಸ್ತಕ', en: 'Khata ledger' },
  search: { hi: 'ग्राहक खोजें…', kn: 'ಗ್ರಾಹಕರನ್ನು ಹುಡುಕಿ…', en: 'Search customer…' },
  noCustomers: { hi: 'अभी कोई ग्राहक नहीं। पहली एंट्री बोलें।', kn: 'ಇನ್ನೂ ಗ್ರಾಹಕರಿಲ್ಲ. ಮೊದಲ ನಮೂದು ಹೇಳಿ.', en: 'No customers yet. Speak your first entry.' },
  owes: { hi: 'बाकी है', kn: 'ಬಾಕಿ ಇದೆ', en: 'owes' },
  advance: { hi: 'जमा', kn: 'ಮುಂಗಡ', en: 'advance' },
  settled: { hi: 'पूरा हुआ', kn: 'ಪೂರ್ಣ', en: 'settled' },
  history: { hi: 'पुराना हिसाब', kn: 'ಹಳೆಯ ಲೆಕ್ಕ', en: 'History' },
  remind: { hi: 'WhatsApp पर याद दिलाएं', kn: 'WhatsApp ನಲ್ಲಿ ನೆನಪಿಸಿ', en: 'Remind on WhatsApp' },
  addEntry: { hi: 'एंट्री जोड़ें', kn: 'ನಮೂದು ಸೇರಿಸಿ', en: 'Add entry' },
  settleUp: { hi: 'पूरा चुकता', kn: 'ಪೂರ್ಣ ಪಾವತಿ', en: 'Settle up' },
  callCustomer: { hi: 'कॉल करें', kn: 'ಕರೆ ಮಾಡಿ', en: 'Call' },
  addPhone: { hi: 'नंबर जोड़ें', kn: 'ಸಂಖ್ಯೆ ಸೇರಿಸಿ', en: 'Add phone' },
  deleteTxn: { hi: 'हटाएं', kn: 'ಅಳಿಸಿ', en: 'Delete' },

  // summary
  totalReceivable: { hi: 'कुल बाकी (आपको मिलना है)', kn: 'ಒಟ್ಟು ಬಾಕಿ (ನಿಮಗೆ ಬರಬೇಕು)', en: 'Total to collect' },
  todayCredit: { hi: 'आज उधार', kn: 'ಇಂದಿನ ಸಾಲ', en: "Today's credit" },
  todayPayment: { hi: 'आज जमा', kn: 'ಇಂದಿನ ಜಮಾ', en: "Today's payment" },
  dueCustomers: { hi: 'बाकीदार ग्राहक', kn: 'ಬಾಕಿ ಇರುವ ಗ್ರಾಹಕರು', en: 'Customers who owe' },
  recentActivity: { hi: 'हाल की एंट्री', kn: 'ಇತ್ತೀಚಿನ ನಮೂದುಗಳು', en: 'Recent activity' },
  topDebtors: { hi: 'सबसे ज़्यादा बाकी', kn: 'ಅತಿ ಹೆಚ್ಚು ಬಾಕಿ', en: 'Top dues' },

  // invoices
  invoices: { hi: 'बिल / इनवॉइस', kn: 'ಬಿಲ್ / ಇನ್‌ವಾಯ್ಸ್', en: 'Invoices' },
  newInvoice: { hi: 'नया बिल बनाएं', kn: 'ಹೊಸ ಬಿಲ್ ರಚಿಸಿ', en: 'New invoice' },
  noInvoices: { hi: 'अभी कोई बिल नहीं', kn: 'ಇನ್ನೂ ಯಾವುದೇ ಬಿಲ್ ಇಲ್ಲ', en: 'No invoices yet' },
  item: { hi: 'सामान', kn: 'ವಸ್ತು', en: 'Item' },
  qty: { hi: 'मात्रा', kn: 'ಪ್ರಮಾಣ', en: 'Qty' },
  rate: { hi: 'रेट', kn: 'ದರ', en: 'Rate' },
  gst: { hi: 'GST %', kn: 'GST %', en: 'GST %' },
  addItem: { hi: 'सामान जोड़ें', kn: 'ವಸ್ತು ಸೇರಿಸಿ', en: 'Add item' },
  total: { hi: 'कुल', kn: 'ಒಟ್ಟು', en: 'Total' },
  generate: { hi: 'बिल बनाएं', kn: 'ಬಿಲ್ ರಚಿಸಿ', en: 'Generate invoice' },
  shareWhatsApp: { hi: 'WhatsApp पर भेजें', kn: 'WhatsApp ನಲ್ಲಿ ಕಳುಹಿಸಿ', en: 'Share on WhatsApp' },
  downloadPdf: { hi: 'PDF डाउनलोड', kn: 'PDF ಡೌನ್‌ಲೋಡ್', en: 'Download PDF' },
  downloadJpg: { hi: 'JPG डाउनलोड', kn: 'JPG ಡೌನ್‌ಲೋಡ್', en: 'Download JPG' },
  viewPdf: { hi: 'बिल देखें', kn: 'ಬಿಲ್ ನೋಡಿ', en: 'View invoice' },
  invoicePreview: { hi: 'बिल प्रीव्यू', kn: 'ಬಿಲ್ ಮುನ್ನೋಟ', en: 'Invoice preview' },
  noGstShop: { hi: 'रेहड़ी — कोई GST नहीं', kn: 'ಬೀದಿ ವ್ಯಾಪಾರ — GST ಇಲ್ಲ', en: 'Street vendor — no GST' },

  // settings
  shopProfile: { hi: 'दुकान की जानकारी', kn: 'ಅಂಗಡಿ ಮಾಹಿತಿ', en: 'Shop profile' },
  editProfile: { hi: 'जानकारी बदलें', kn: 'ಮಾಹಿತಿ ಬದಲಿಸಿ', en: 'Edit profile' },
  language: { hi: 'भाषा', kn: 'ಭಾಷೆ', en: 'Language' },
  logout: { hi: 'लॉग आउट', kn: 'ಲಾಗ್ ಔಟ್', en: 'Logout' },
  saveChanges: { hi: 'सेव करें', kn: 'ಉಳಿಸಿ', en: 'Save changes' },

  // generic
  loading: { hi: 'लोड हो रहा है…', kn: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…', en: 'Loading…' },
  somethingWrong: { hi: 'कुछ गड़बड़ हुई', kn: 'ಏನೋ ತಪ್ಪಾಯಿತು', en: 'Something went wrong' },
  required: { hi: 'ज़रूरी है', kn: 'ಅಗತ್ಯ', en: 'required' },
}

export function t(lang, key) {
  const entry = STR[key]
  if (!entry) return key
  return entry[lang] || entry.en
}
