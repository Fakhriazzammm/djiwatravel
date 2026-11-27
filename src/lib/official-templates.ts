/**
 * Official itinerary templates written by Travo. They are published by migration 088 (generated
 * from this file by `scripts/gen-official-templates-migration.mjs`, so the SQL cannot drift) and
 * feed the matching SEO guides in `travel-guides-itinerary.ts`. Only well-known places, no prices,
 * opening hours or fares: those change, and the Agenda/Travo budget tools fill them in per trip.
 */
export type OfficialItem = readonly [
  start: string,
  title: string,
  location: string,
  category: "wisata" | "kuliner" | "belanja" | "transport" | "akomodasi" | "lainnya",
];

export type OfficialTemplate = {
  slug: string;
  code: string;
  country: string;
  /** "Jepang 7 Hari: Tokyo, Kyoto, Osaka" */
  title: string;
  description: string;
  /** Guide copy */
  intro: string;
  tips: readonly { title: string; body: string }[];
  faqs: readonly { question: string; answer: string }[];
  source: { label: string; url: string };
  /** Cover photo (wikimedia only); filled by the generator script when empty. */
  cover?: string;
  featured?: boolean;
  days: readonly (readonly OfficialItem[])[];
};

export const OFFICIAL_OWNER_SUBJECT = "travo-official";
export const OFFICIAL_OWNER_NAME = "Travo";

export const officialTemplates: readonly OfficialTemplate[] = [
  {
    slug: "travo-jepang-7-hari-tokyo-kyoto-osaka",
    code: "JP",
    country: "Jepang",
    title: "Jepang 7 Hari: Tokyo, Kyoto, Osaka",
    description:
      "Rute pertama kali ke Jepang: 3 hari Tokyo, 2 hari Kyoto, 2 hari Osaka dengan Shinkansen di antaranya.",
    intro:
      "Rute Tokyo, Kyoto, Osaka adalah jalur klasik untuk perjalanan pertama ke Jepang: tiga kota besar yang terhubung Shinkansen, dengan kombinasi kota modern, kuil, dan kuliner. Template ini membagi tujuh hari tanpa memadatkan jadwal, dan mudah digeser bila penerbanganmu mendarat atau pulang dari kota lain.",
    tips: [
      {
        title: "Pilih penginapan dekat stasiun besar",
        body: "Di Tokyo dan Osaka, menginap dalam jarak jalan kaki ke stasiun utama memangkas waktu berpindah dan memudahkan membawa koper.",
      },
      {
        title: "Siapkan kartu transportasi dan eSIM",
        body: "Kartu IC seperti Suica atau ICOCA memudahkan kereta dan bus lokal, sedangkan eSIM menjaga peta dan terjemahan tetap hidup sejak mendarat.",
      },
      {
        title: "Beri ruang cadangan di Hari 7",
        body: "Hari kepulangan sebaiknya ringan. Hitung waktu ke bandara dan jangan menjadwalkan atraksi besar sebelum penerbangan.",
      },
    ],
    faqs: [
      {
        question: "Apakah 7 hari cukup untuk Tokyo, Kyoto, dan Osaka?",
        answer:
          "Cukup untuk sorotan utama bila kamu tidak memadatkan jadwal: tiga hari Tokyo, dua hari Kyoto, dan dua hari Osaka termasuk hari datang dan pulang.",
      },
      {
        question: "Perlu beli JR Pass untuk rute ini?",
        answer:
          "Tidak selalu. Hitung tarif tiket kereta antarkota satuan dan bandingkan dengan harga pass terbaru sebelum memutuskan.",
      },
    ],
    source: { label: "JNTO: informasi resmi wisata Jepang", url: "https://www.japan.travel/en/" },
    featured: true,
    days: [
      [
        [
          "15:00",
          "Tiba di bandara dan menuju penginapan",
          "Bandara Narita atau Haneda, Tokyo",
          "transport",
        ],
        [
          "17:30",
          "Check-in dan jalan santai di sekitar penginapan",
          "Shinjuku, Tokyo",
          "akomodasi",
        ],
        ["19:00", "Makan malam ramen atau izakaya dekat stasiun", "Shinjuku, Tokyo", "kuliner"],
      ],
      [
        ["09:00", "Kuil Sensoji dan Nakamise", "Asakusa, Tokyo", "wisata"],
        ["12:30", "Makan siang di sekitar Asakusa", "Asakusa, Tokyo", "kuliner"],
        ["14:30", "Tokyo Skytree dan Solamachi", "Sumida, Tokyo", "wisata"],
        ["18:30", "Persimpangan Shibuya dan Shibuya Sky", "Shibuya, Tokyo", "wisata"],
      ],
      [
        ["09:30", "Taman Meiji Jingu", "Shibuya, Tokyo", "wisata"],
        ["11:30", "Jalan Takeshita dan Omotesando", "Harajuku, Tokyo", "belanja"],
        ["15:00", "Museum, belanja, atau perjalanan sehari sesuai minat", "Tokyo", "wisata"],
        ["19:00", "Makan malam dan jalan malam di Shinjuku", "Shinjuku, Tokyo", "kuliner"],
      ],
      [
        ["08:30", "Check-out dan menuju Stasiun Tokyo", "Stasiun Tokyo, Tokyo", "transport"],
        ["09:30", "Shinkansen Tokyo ke Kyoto", "Stasiun Kyoto, Kyoto", "transport"],
        ["13:30", "Kuil Kiyomizudera dan lorong Sannenzaka", "Higashiyama, Kyoto", "wisata"],
        ["18:00", "Jalan malam di distrik Gion", "Gion, Kyoto", "wisata"],
      ],
      [
        ["08:00", "Hutan bambu Arashiyama", "Arashiyama, Kyoto", "wisata"],
        ["10:30", "Kuil Tenryuji dan taman", "Arashiyama, Kyoto", "wisata"],
        ["14:00", "Kuil Kinkakuji (Paviliun Emas)", "Kita, Kyoto", "wisata"],
        ["18:30", "Pasar Nishiki dan makan malam", "Nakagyo, Kyoto", "kuliner"],
      ],
      [
        ["09:00", "Check-out dan kereta ke Osaka", "Stasiun Osaka, Osaka", "transport"],
        ["11:30", "Kastil Osaka dan taman", "Chuo, Osaka", "wisata"],
        ["15:00", "Umeda Sky Building", "Kita, Osaka", "wisata"],
        ["19:00", "Dotonbori dan makan malam takoyaki", "Dotonbori, Osaka", "kuliner"],
      ],
      [
        ["10:00", "Belanja oleh-oleh dan Shinsaibashi", "Shinsaibashi, Osaka", "belanja"],
        ["13:00", "Makan siang terakhir di Namba", "Namba, Osaka", "kuliner"],
        ["15:30", "Menuju Bandara Kansai", "Bandara Kansai, Osaka", "transport"],
      ],
    ],
  },
  {
    slug: "travo-korea-selatan-5-hari-seoul-busan",
    code: "KR",
    country: "Korea Selatan",
    title: "Korea Selatan 5 Hari: Seoul dan Busan",
    description:
      "Lima hari: tiga hari Seoul dengan istana dan pasar, lalu dua hari Busan dengan pantai dan kuil tepi laut.",
    intro:
      "Seoul dan Busan memberi dua wajah Korea Selatan: ibu kota yang menggabungkan istana tua dengan pusat belanja modern, dan kota pelabuhan dengan pantai serta pasar ikan. Template lima hari ini cocok untuk liburan pertama dan mengandalkan kereta cepat KTX di antara keduanya.",
    tips: [
      {
        title: "Siapkan kartu transportasi dan aplikasi peta lokal",
        body: "Kartu seperti T-money memudahkan subway dan bus. Fitur navigasi Google Maps di Korea Selatan terbatas, jadi banyak traveler memakai Naver Map atau KakaoMap.",
      },
      {
        title: "Cek aturan masuk resmi sebelum membeli tiket",
        body: "Persyaratan masuk dan izin perjalanan dapat berubah. Periksa situs imigrasi resmi sebelum berangkat.",
      },
      {
        title: "Cadangkan waktu untuk antrean makanan jalanan",
        body: "Pasar populer ramai di akhir pekan. Datang lebih pagi atau pilih jam di luar jam makan utama.",
      },
    ],
    faqs: [
      {
        question: "Apakah 5 hari cukup untuk Seoul dan Busan?",
        answer:
          "Cukup untuk sorotan utama: tiga hari Seoul dan dua hari Busan, termasuk perjalanan KTX di antaranya.",
      },
      {
        question: "Kapan waktu terbaik mengunjungi Korea Selatan?",
        answer:
          "Musim semi dan musim gugur umumnya sejuk dan nyaman, tetapi ramai. Musim dingin sangat dingin, jadi siapkan pakaian berlapis.",
      },
    ],
    source: {
      label: "Korea Tourism Organization: situs wisata resmi",
      url: "https://english.visitkorea.or.kr/",
    },
    days: [
      [
        ["14:00", "Tiba di Bandara Incheon", "Bandara Incheon, Incheon", "transport"],
        ["16:30", "Kereta bandara ke pusat kota dan check-in", "Myeongdong, Seoul", "akomodasi"],
        ["19:00", "Makan malam dan jalan di Myeongdong", "Myeongdong, Seoul", "kuliner"],
      ],
      [
        ["09:30", "Istana Gyeongbokgung", "Jongno, Seoul", "wisata"],
        ["12:30", "Makan siang di Insadong", "Insadong, Seoul", "kuliner"],
        ["14:30", "Desa Hanok Bukchon", "Bukchon, Seoul", "wisata"],
        ["18:30", "Pasar Gwangjang", "Jongno, Seoul", "kuliner"],
      ],
      [
        ["10:00", "Hongdae dan belanja kafe", "Hongdae, Seoul", "belanja"],
        ["14:00", "Namsan Seoul Tower", "Yongsan, Seoul", "wisata"],
        ["18:00", "Taman Sungai Han dan makan malam", "Yeouido, Seoul", "wisata"],
      ],
      [
        ["08:30", "Kereta KTX Seoul ke Busan", "Stasiun Busan, Busan", "transport"],
        ["12:00", "Pasar Ikan Jagalchi", "Jung-gu, Busan", "kuliner"],
        ["15:00", "Desa Budaya Gamcheon", "Saha, Busan", "wisata"],
        ["19:00", "Pantai Haeundae malam", "Haeundae, Busan", "wisata"],
      ],
      [
        ["09:30", "Kuil Haedong Yonggungsa", "Gijang, Busan", "wisata"],
        ["13:00", "Makan siang dan oleh-oleh", "Haeundae, Busan", "belanja"],
        ["16:00", "Kembali ke bandara atau kereta ke Seoul", "Stasiun Busan, Busan", "transport"],
      ],
    ],
  },
  {
    slug: "travo-thailand-5-hari-bangkok-phuket",
    code: "TH",
    country: "Thailand",
    title: "Thailand 5 Hari: Bangkok dan Phuket",
    description:
      "Tiga hari Bangkok untuk kuil dan pasar, dua hari Phuket untuk pantai dan kota tua.",
    intro:
      "Thailand mudah dinikmati dalam lima hari: Bangkok untuk kuil, sungai, dan kuliner jalanan, lalu terbang singkat ke Phuket untuk pantai dan kota tua. Template ini menyisakan waktu longgar karena cuaca dan lalu lintas Bangkok sering mengubah rencana.",
    tips: [
      {
        title: "Hindari jam macet Bangkok",
        body: "Gunakan BTS atau MRT di jam sibuk dan kapal sungai untuk kawasan kota tua, supaya tidak terjebak macet.",
      },
      {
        title: "Periksa musim dan kondisi laut Phuket",
        body: "Musim hujan dapat membuat laut bergelombang dan sebagian tur dibatalkan. Cek prakiraan sebelum memesan tur pulau.",
      },
      {
        title: "Cek persyaratan masuk terbaru",
        body: "Aturan imigrasi termasuk data kedatangan digital dapat berubah. Periksa situs resmi sebelum berangkat.",
      },
    ],
    faqs: [
      {
        question: "Apakah perlu terbang antara Bangkok dan Phuket?",
        answer:
          "Penerbangan domestik adalah cara paling cepat untuk jarak itu. Periksa jadwal dan aturan bagasi maskapai sebelum memesan.",
      },
      {
        question: "Kapan waktu terbaik ke Thailand?",
        answer:
          "Musim kering yang lebih sejuk umumnya paling nyaman, tetapi cuaca berbeda antara Bangkok dan pantai barat Phuket. Cek prakiraan untuk tanggalmu.",
      },
    ],
    source: { label: "Tourism Authority of Thailand", url: "https://www.tourismthailand.org/" },
    days: [
      [
        ["14:00", "Tiba di Bandara Suvarnabhumi", "Bandara Suvarnabhumi, Bangkok", "transport"],
        [
          "17:00",
          "Check-in dan jalan malam di sekitar penginapan",
          "Sukhumvit, Bangkok",
          "akomodasi",
        ],
        ["19:30", "Makan malam khas Thailand", "Sukhumvit, Bangkok", "kuliner"],
      ],
      [
        ["09:00", "Grand Palace dan Wat Phra Kaew", "Phra Nakhon, Bangkok", "wisata"],
        ["12:30", "Wat Pho dan makan siang", "Phra Nakhon, Bangkok", "wisata"],
        ["15:30", "Naik kapal sungai dan Wat Arun", "Chao Phraya, Bangkok", "wisata"],
        ["19:00", "Pasar malam dan jajanan", "Bangkok", "kuliner"],
      ],
      [
        ["10:00", "Pasar Chatuchak (akhir pekan) atau mal", "Chatuchak, Bangkok", "belanja"],
        ["15:00", "Pijat tradisional dan istirahat", "Bangkok", "lainnya"],
        ["19:00", "Makan malam di Chinatown", "Yaowarat, Bangkok", "kuliner"],
      ],
      [
        ["09:00", "Terbang ke Phuket", "Bandara Phuket, Phuket", "transport"],
        ["13:00", "Check-in dan makan siang", "Patong, Phuket", "akomodasi"],
        ["15:30", "Pantai dan matahari terbenam", "Kata, Phuket", "wisata"],
        ["19:00", "Makan malam seafood", "Patong, Phuket", "kuliner"],
      ],
      [
        ["09:30", "Kota Tua Phuket", "Phuket Town, Phuket", "wisata"],
        ["12:30", "Makan siang dan belanja oleh-oleh", "Phuket Town, Phuket", "belanja"],
        ["15:30", "Menuju Bandara Phuket", "Bandara Phuket, Phuket", "transport"],
      ],
    ],
  },
  {
    slug: "travo-singapura-4-hari-klasik",
    code: "SG",
    country: "Singapura",
    title: "Singapura 4 Hari: Rute Klasik",
    description:
      "Empat hari Singapura: Marina Bay, Gardens by the Bay, Sentosa, dan jajanan di hawker center.",
    intro:
      "Singapura kompak dan mudah dijelajahi dengan MRT, sehingga empat hari cukup untuk sorotan utamanya. Template ini memadukan ikon kota, taman, dan makan di hawker center, dengan ruang istirahat siang karena cuacanya panas dan lembap.",
    tips: [
      {
        title: "Pakai kartu contactless di MRT",
        body: "Banyak gerbang menerima kartu bank contactless atau kartu transportasi, jadi tidak perlu tiket kertas. Cek kartu yang kamu bawa sebelum berangkat.",
      },
      {
        title: "Beri jeda di tengah hari",
        body: "Cuaca panas dan lembap. Rencanakan atraksi dalam ruangan atau istirahat di siang hari.",
      },
      {
        title: "Pesan atraksi populer lebih awal",
        body: "Beberapa atraksi ramai di akhir pekan. Periksa jadwal dan tiket di situs resminya.",
      },
    ],
    faqs: [
      {
        question: "Apakah 4 hari cukup untuk Singapura?",
        answer:
          "Cukup untuk ikon utama: Marina Bay, Gardens by the Bay, Sentosa, dan kawasan budaya, dengan sisa waktu untuk makan.",
      },
      {
        question: "Bagaimana transportasi terbaik di Singapura?",
        answer:
          "MRT dan bus mencakup hampir semua tujuan wisata. Jalan kaki dan taksi online melengkapi rute pendek.",
      },
    ],
    source: { label: "Visit Singapore: situs resmi", url: "https://www.visitsingapore.com/" },
    days: [
      [
        ["14:00", "Tiba di Changi dan MRT ke kota", "Bandara Changi, Singapura", "transport"],
        ["16:30", "Check-in dan jalan di Bugis", "Bugis, Singapura", "akomodasi"],
        ["19:00", "Makan malam di hawker center", "Singapura", "kuliner"],
      ],
      [
        ["09:30", "Gardens by the Bay dan Cloud Forest", "Marina Bay, Singapura", "wisata"],
        ["13:00", "Makan siang di Marina Bay Sands", "Marina Bay, Singapura", "kuliner"],
        ["15:30", "Merlion Park dan Esplanade", "Marina Bay, Singapura", "wisata"],
        ["19:30", "Pertunjukan cahaya Spectra", "Marina Bay, Singapura", "wisata"],
      ],
      [
        ["10:00", "Sentosa dan pantai", "Sentosa, Singapura", "wisata"],
        ["14:00", "Universal Studios atau atraksi lain", "Sentosa, Singapura", "wisata"],
        ["19:00", "Makan malam di Chinatown", "Chinatown, Singapura", "kuliner"],
      ],
      [
        ["10:00", "Little India dan Kampong Glam", "Singapura", "wisata"],
        ["13:00", "Makan siang dan belanja oleh-oleh", "Orchard, Singapura", "belanja"],
        ["16:30", "Menuju Bandara Changi", "Bandara Changi, Singapura", "transport"],
      ],
    ],
  },
  {
    slug: "travo-malaysia-5-hari-kuala-lumpur-penang",
    code: "MY",
    country: "Malaysia",
    title: "Malaysia 5 Hari: Kuala Lumpur dan Penang",
    description:
      "Tiga hari Kuala Lumpur dengan menara dan kuliner, dua hari Penang untuk George Town dan jajanan.",
    intro:
      "Kuala Lumpur memberi ikon kota dan belanja, sementara Penang terkenal untuk seni jalanan dan kuliner George Town. Lima hari cukup untuk menikmati keduanya dengan satu penerbangan domestik singkat atau perjalanan darat.",
    tips: [
      {
        title: "Pesan transportasi daring untuk rute pendek",
        body: "Aplikasi transportasi daring praktis untuk jarak pendek, sedangkan KLIA Ekspres cepat dari bandara ke pusat kota.",
      },
      {
        title: "Periksa waktu ibadah dan dress code tempat suci",
        body: "Masjid dan kuil punya aturan pakaian dan jam kunjungan. Cek sebelum datang.",
      },
      {
        title: "Beri waktu makan di Penang",
        body: "Kuliner adalah daya tarik utama Penang. Sisakan satu sesi makan siang yang tidak terburu-buru.",
      },
    ],
    faqs: [
      {
        question: "Lebih baik terbang atau naik bus ke Penang?",
        answer:
          "Penerbangan lebih cepat, sedangkan bus atau kereta lebih murah tetapi memakan waktu. Bandingkan jadwal dan harga terbaru.",
      },
      {
        question: "Apa yang wajib dicoba di Penang?",
        answer:
          "Kuliner jalanan George Town seperti char kway teow dan assam laksa adalah ciri khas Penang.",
      },
    ],
    source: { label: "Tourism Malaysia: situs resmi", url: "https://www.malaysia.travel/" },
    days: [
      [
        ["14:00", "Tiba di KLIA dan menuju kota", "Bandara KLIA, Kuala Lumpur", "transport"],
        [
          "17:00",
          "Check-in dan makan malam di Bukit Bintang",
          "Bukit Bintang, Kuala Lumpur",
          "akomodasi",
        ],
      ],
      [
        ["09:30", "Menara Petronas dan taman KLCC", "KLCC, Kuala Lumpur", "wisata"],
        ["13:00", "Makan siang dan belanja", "Bukit Bintang, Kuala Lumpur", "kuliner"],
        ["16:00", "Pasar Seni dan Petaling Street", "Chinatown, Kuala Lumpur", "belanja"],
      ],
      [
        ["09:00", "Batu Caves", "Gombak, Selangor", "wisata"],
        ["13:00", "Makan siang dan istirahat", "Kuala Lumpur", "kuliner"],
        ["16:00", "Terbang ke Penang", "Bandara Penang, Penang", "transport"],
      ],
      [
        ["09:30", "Seni jalanan George Town", "George Town, Penang", "wisata"],
        ["13:00", "Makan siang kuliner Penang", "George Town, Penang", "kuliner"],
        ["16:00", "Kuil Kek Lok Si", "Air Itam, Penang", "wisata"],
      ],
      [
        ["09:30", "Pantai dan oleh-oleh", "Batu Ferringhi, Penang", "belanja"],
        ["14:00", "Menuju Bandara Penang", "Bandara Penang, Penang", "transport"],
      ],
    ],
  },
  {
    slug: "travo-hong-kong-4-hari-kota-dan-pulau",
    code: "HK",
    country: "Hong Kong",
    title: "Hong Kong 4 Hari: Kota dan Pulau",
    description:
      "Victoria Peak, Star Ferry, pasar malam, dan perjalanan ke Lantau untuk Big Buddha.",
    intro:
      "Hong Kong padat dan efisien: gedung pencakar langit, pelabuhan, pasar, dan alam dalam jarak singkat. Empat hari cukup untuk ikon kota dan satu hari di Pulau Lantau, dengan MTR yang menghubungkan hampir semuanya.",
    tips: [
      {
        title: "Pakai kartu Octopus atau kartu contactless",
        body: "Kartu transportasi memudahkan MTR, bus, dan Star Ferry. Periksa pilihan yang tersedia saat tiba.",
      },
      {
        title: "Pilih hari cerah untuk The Peak",
        body: "Kabut dapat menutup pemandangan. Cek prakiraan sebelum naik.",
      },
      {
        title: "Siapkan sepatu nyaman",
        body: "Banyak area berbukit dan menanjak. Alas kaki nyaman membantu.",
      },
    ],
    faqs: [
      {
        question: "Apakah 4 hari cukup untuk Hong Kong?",
        answer:
          "Cukup untuk sorotan utama dan satu hari di Lantau, dengan waktu santai untuk makan dan belanja.",
      },
      {
        question: "Bagaimana dari bandara ke kota?",
        answer:
          "Airport Express adalah pilihan cepat, dan bus melayani banyak area dengan tarif berbeda. Bandingkan sesuai penginapanmu.",
      },
    ],
    source: { label: "Discover Hong Kong: situs resmi", url: "https://www.discoverhongkong.com/" },
    days: [
      [
        [
          "14:00",
          "Tiba di bandara dan Airport Express",
          "Bandara Hong Kong, Hong Kong",
          "transport",
        ],
        ["17:00", "Check-in dan jalan di Tsim Sha Tsui", "Tsim Sha Tsui, Hong Kong", "akomodasi"],
        ["20:00", "Pertunjukan cahaya dan makan malam", "Tsim Sha Tsui, Hong Kong", "wisata"],
      ],
      [
        ["09:30", "Star Ferry ke Pulau Hong Kong", "Victoria Harbour, Hong Kong", "transport"],
        ["11:00", "Victoria Peak", "The Peak, Hong Kong", "wisata"],
        ["15:00", "Central dan Soho", "Central, Hong Kong", "wisata"],
        ["19:00", "Makan malam dim sum atau hidangan Kanton", "Central, Hong Kong", "kuliner"],
      ],
      [
        ["09:00", "Kereta gantung Ngong Ping dan Big Buddha", "Lantau, Hong Kong", "wisata"],
        ["13:00", "Makan siang di Tai O", "Tai O, Hong Kong", "kuliner"],
        ["18:00", "Pasar malam Temple Street", "Yau Ma Tei, Hong Kong", "belanja"],
      ],
      [
        ["10:00", "Belanja dan oleh-oleh", "Mong Kok, Hong Kong", "belanja"],
        ["14:00", "Menuju bandara", "Bandara Hong Kong, Hong Kong", "transport"],
      ],
    ],
  },
  {
    slug: "travo-taiwan-5-hari-taipei-dan-sekitarnya",
    code: "TW",
    country: "Taiwan",
    title: "Taiwan 5 Hari: Taipei dan Sekitarnya",
    description:
      "Taipei 101, pasar malam, perjalanan sehari ke Jiufen, dan sumber air panas Beitou.",
    intro:
      "Taipei kompak, ramah pejalan kaki, dan penuh jajanan. Lima hari memberi ruang untuk ikon kota, pasar malam, perjalanan sehari ke kota tambang Jiufen, dan berendam di sumber air panas Beitou.",
    tips: [
      {
        title: "Pakai kartu transportasi di MRT dan bus",
        body: "Kartu seperti EasyCard memudahkan MRT dan bus. Periksa pilihan kartu terbaru di stasiun.",
      },
      {
        title: "Bawa payung",
        body: "Hujan bisa turun mendadak di Taipei dan Jiufen. Payung lipat berguna.",
      },
      {
        title: "Datang ke pasar malam setelah gelap",
        body: "Pasar malam paling hidup setelah sore. Datang tanpa terburu-buru agar bisa mencicipi beberapa stan.",
      },
    ],
    faqs: [
      {
        question: "Apakah Jiufen bisa ditempuh sehari dari Taipei?",
        answer:
          "Bisa. Banyak traveler pergi dengan bus atau kereta dan kembali sore hari. Periksa jadwal dan kondisi cuaca.",
      },
      {
        question: "Apa yang khas dari kuliner Taiwan?",
        answer:
          "Pasar malam dengan jajanan seperti ayam goreng, mie, dan teh susu mutiara adalah ciri khasnya.",
      },
    ],
    source: { label: "Taiwan Tourism Administration", url: "https://eng.taiwan.net.tw/" },
    days: [
      [
        [
          "14:00",
          "Tiba di Bandara Taoyuan dan MRT ke kota",
          "Bandara Taoyuan, Taipei",
          "transport",
        ],
        ["17:30", "Check-in dan makan malam", "Ximending, Taipei", "akomodasi"],
      ],
      [
        ["09:30", "Chiang Kai-shek Memorial Hall", "Zhongzheng, Taipei", "wisata"],
        ["13:00", "Makan siang dan Din Tai Fung", "Xinyi, Taipei", "kuliner"],
        ["15:30", "Taipei 101", "Xinyi, Taipei", "wisata"],
        ["19:00", "Pasar malam Shilin", "Shilin, Taipei", "kuliner"],
      ],
      [
        ["08:30", "Perjalanan ke Jiufen", "Jiufen, New Taipei", "transport"],
        ["10:30", "Jalan tua Jiufen dan rumah teh", "Jiufen, New Taipei", "wisata"],
        ["16:00", "Kembali ke Taipei dan istirahat", "Taipei", "lainnya"],
      ],
      [
        ["10:00", "Sumber air panas Beitou", "Beitou, Taipei", "wisata"],
        ["14:30", "Kuil Longshan", "Wanhua, Taipei", "wisata"],
        ["18:30", "Pasar malam Raohe", "Songshan, Taipei", "kuliner"],
      ],
      [
        ["10:00", "Belanja oleh-oleh", "Ximending, Taipei", "belanja"],
        ["14:00", "Menuju Bandara Taoyuan", "Bandara Taoyuan, Taipei", "transport"],
      ],
    ],
  },
  {
    slug: "travo-vietnam-6-hari-hanoi-da-nang-ho-chi-minh",
    code: "VN",
    country: "Vietnam",
    title: "Vietnam 6 Hari: Hanoi, Da Nang, Ho Chi Minh",
    description:
      "Tiga kota dalam enam hari: Kota Tua Hanoi, Jembatan Emas dan Hoi An, lalu Ho Chi Minh City.",
    intro:
      "Vietnam memanjang dari utara ke selatan, jadi rute enam hari ini memakai penerbangan domestik antar tiga kota: Hanoi untuk kota tua, Da Nang dan Hoi An untuk pantai dan kota lampion, lalu Ho Chi Minh City yang sibuk.",
    tips: [
      {
        title: "Beri waktu untuk penerbangan domestik",
        body: "Jadwal dan aturan bagasi berbeda antar maskapai. Periksa sebelum memesan.",
      },
      {
        title: "Periksa persyaratan masuk",
        body: "Ketentuan visa atau izin masuk untuk paspor Indonesia dapat berubah. Cek sumber resmi.",
      },
      {
        title: "Hati-hati menyeberang jalan",
        body: "Lalu lintas sepeda motor padat. Seberang perlahan dan konsisten.",
      },
    ],
    faqs: [
      {
        question: "Apakah rute tiga kota ini terlalu padat?",
        answer: "Cukup padat untuk enam hari. Kurangi satu kota bila ingin ritme lebih santai.",
      },
      {
        question: "Apa kuliner khas yang perlu dicoba?",
        answer:
          "Pho di Hanoi, cao lau di Hoi An, dan banh mi di Ho Chi Minh City adalah pilihan populer.",
      },
    ],
    source: { label: "Vietnam National Authority of Tourism", url: "https://vietnam.travel/" },
    days: [
      [
        ["14:00", "Tiba di Bandara Noi Bai", "Bandara Noi Bai, Hanoi", "transport"],
        ["17:00", "Check-in dan jalan di Kota Tua", "Hoan Kiem, Hanoi", "akomodasi"],
        ["19:00", "Makan malam pho dan bun cha", "Hoan Kiem, Hanoi", "kuliner"],
      ],
      [
        ["09:00", "Danau Hoan Kiem dan Kuil Ngoc Son", "Hoan Kiem, Hanoi", "wisata"],
        ["11:30", "Mausoleum Ho Chi Minh dan Pagoda Satu Pilar", "Ba Dinh, Hanoi", "wisata"],
        ["15:00", "Kuil Sastra", "Dong Da, Hanoi", "wisata"],
        ["18:30", "Pertunjukan boneka air atau jalan malam", "Hoan Kiem, Hanoi", "wisata"],
      ],
      [
        ["09:00", "Terbang ke Da Nang", "Bandara Da Nang, Da Nang", "transport"],
        ["13:00", "Jembatan Emas di Ba Na Hills", "Ba Na Hills, Da Nang", "wisata"],
        ["18:30", "Makan malam seafood", "My Khe, Da Nang", "kuliner"],
      ],
      [
        ["09:00", "Kota tua Hoi An", "Hoi An, Quang Nam", "wisata"],
        ["13:00", "Makan siang cao lau", "Hoi An, Quang Nam", "kuliner"],
        ["18:30", "Lampion malam di sungai", "Hoi An, Quang Nam", "wisata"],
      ],
      [
        [
          "10:00",
          "Terbang ke Ho Chi Minh City",
          "Bandara Tan Son Nhat, Ho Chi Minh City",
          "transport",
        ],
        [
          "14:00",
          "Gereja Notre-Dame dan Kantor Pos Pusat",
          "Distrik 1, Ho Chi Minh City",
          "wisata",
        ],
        ["18:30", "Pasar malam dan makan malam", "Distrik 1, Ho Chi Minh City", "kuliner"],
      ],
      [
        ["09:00", "Pasar Ben Thanh dan oleh-oleh", "Distrik 1, Ho Chi Minh City", "belanja"],
        ["13:00", "Makan siang banh mi", "Distrik 1, Ho Chi Minh City", "kuliner"],
        ["15:30", "Menuju bandara", "Bandara Tan Son Nhat, Ho Chi Minh City", "transport"],
      ],
    ],
  },
  {
    slug: "travo-turki-7-hari-istanbul-kapadokia",
    code: "TR",
    country: "Turki",
    title: "Turki 7 Hari: Istanbul dan Kapadokia",
    description:
      "Empat hari Istanbul dengan masjid dan Bosphorus, lalu tiga hari Kapadokia dengan lembah dan gua.",
    intro:
      "Istanbul menghubungkan dua benua dengan masjid, bazar, dan selat Bosphorus, sedangkan Kapadokia terkenal dengan formasi batu dan rumah gua. Rute tujuh hari ini memakai penerbangan domestik ke Kapadokia agar tidak menghabiskan waktu di jalan.",
    tips: [
      {
        title: "Hormati aturan masuk masjid",
        body: "Masjid punya jam kunjungan dan aturan pakaian, termasuk penutup kepala dan bahu. Cek sebelum datang.",
      },
      {
        title: "Pesan aktivitas balon udara jauh hari",
        body: "Aktivitas balon di Kapadokia bergantung cuaca dan sering penuh. Pesan lebih awal dan siapkan hari cadangan.",
      },
      {
        title: "Siapkan pakaian berlapis",
        body: "Pagi di Kapadokia bisa dingin walau siang hangat.",
      },
    ],
    faqs: [
      {
        question: "Bagaimana cara ke Kapadokia dari Istanbul?",
        answer:
          "Penerbangan domestik ke Kayseri atau Nevsehir adalah pilihan cepat. Bus malam juga tersedia tetapi memakan banyak waktu.",
      },
      {
        question: "Apakah balon udara selalu terbang?",
        answer:
          "Tidak. Penerbangan bergantung pada cuaca dan keputusan operator. Sisakan hari cadangan.",
      },
    ],
    source: { label: "Go Türkiye: situs wisata resmi", url: "https://goturkiye.com/" },
    days: [
      [
        ["15:00", "Tiba di Istanbul dan check-in", "Sultanahmet, Istanbul", "akomodasi"],
        ["18:30", "Jalan sore dan makan malam", "Sultanahmet, Istanbul", "kuliner"],
      ],
      [
        ["09:00", "Hagia Sophia", "Sultanahmet, Istanbul", "wisata"],
        ["11:30", "Masjid Biru", "Sultanahmet, Istanbul", "wisata"],
        ["14:30", "Istana Topkapi", "Fatih, Istanbul", "wisata"],
        ["18:30", "Makan malam khas Turki", "Sultanahmet, Istanbul", "kuliner"],
      ],
      [
        ["09:30", "Grand Bazaar", "Fatih, Istanbul", "belanja"],
        ["13:00", "Pasar Rempah dan makan siang", "Eminonu, Istanbul", "kuliner"],
        ["16:00", "Pelayaran Bosphorus", "Bosphorus, Istanbul", "wisata"],
      ],
      [
        ["10:00", "Menara Galata dan Istiklal", "Beyoglu, Istanbul", "wisata"],
        ["14:00", "Kafe dan belanja", "Karakoy, Istanbul", "belanja"],
        ["19:00", "Terbang ke Kapadokia", "Bandara Kayseri, Kapadokia", "transport"],
      ],
      [
        [
          "06:00",
          "Balon udara saat matahari terbit (jika cuaca mengizinkan)",
          "Goreme, Kapadokia",
          "wisata",
        ],
        ["11:00", "Museum Terbuka Goreme", "Goreme, Kapadokia", "wisata"],
        ["15:00", "Lembah Love dan Pasabag", "Goreme, Kapadokia", "wisata"],
      ],
      [
        ["09:30", "Kota bawah tanah Derinkuyu", "Derinkuyu, Kapadokia", "wisata"],
        ["13:00", "Makan siang dan keramik Avanos", "Avanos, Kapadokia", "kuliner"],
        ["17:00", "Matahari terbenam di Uchisar", "Uchisar, Kapadokia", "wisata"],
      ],
      [
        ["07:30", "Sarapan dan check-out", "Goreme, Kapadokia", "akomodasi"],
        [
          "09:00",
          "Menuju bandara dan penerbangan pulang",
          "Bandara Kayseri, Kapadokia",
          "transport",
        ],
      ],
    ],
  },
  {
    slug: "travo-uni-emirat-arab-5-hari-dubai-abu-dhabi",
    code: "AE",
    country: "Uni Emirat Arab",
    title: "Uni Emirat Arab 5 Hari: Dubai dan Abu Dhabi",
    description:
      "Burj Khalifa, gurun, Masjid Agung Sheikh Zayed, dan Louvre Abu Dhabi dalam lima hari.",
    intro:
      "Dubai terkenal dengan gedung pencakar langit dan belanja, sedangkan Abu Dhabi menawarkan masjid megah dan museum. Keduanya hanya berjarak sekitar satu setengah jam berkendara, sehingga lima hari cukup untuk menjelajahi keduanya.",
    tips: [
      {
        title: "Hindari panas tengah hari",
        body: "Cuaca bisa sangat panas. Jadwalkan kegiatan luar ruang pagi atau sore, dan manfaatkan mal atau museum di siang hari.",
      },
      {
        title: "Hormati aturan berpakaian di tempat ibadah",
        body: "Masjid Agung Sheikh Zayed mewajibkan pakaian sopan. Cek aturan terbaru sebelum datang.",
      },
      {
        title: "Periksa persyaratan masuk",
        body: "Aturan visa dapat berubah menurut paspor. Cek situs resmi sebelum berangkat.",
      },
    ],
    faqs: [
      {
        question: "Bagaimana cara ke Abu Dhabi dari Dubai?",
        answer:
          "Bus antarkota atau taksi/transportasi daring adalah pilihan umum. Periksa tarif dan jadwal terbaru.",
      },
      {
        question: "Kapan waktu terbaik ke UEA?",
        answer: "Bulan-bulan yang lebih sejuk umumnya lebih nyaman. Musim panas sangat panas.",
      },
    ],
    source: { label: "Visit Dubai: situs resmi", url: "https://www.visitdubai.com/" },
    days: [
      [
        ["14:00", "Tiba di Dubai dan check-in", "Downtown, Dubai", "akomodasi"],
        ["18:00", "Dubai Fountain di Dubai Mall", "Downtown, Dubai", "wisata"],
        ["20:00", "Makan malam", "Downtown, Dubai", "kuliner"],
      ],
      [
        ["09:00", "Burj Khalifa", "Downtown, Dubai", "wisata"],
        ["13:00", "Makan siang dan Dubai Mall", "Downtown, Dubai", "belanja"],
        ["17:00", "Souk Emas dan Souk Rempah", "Deira, Dubai", "belanja"],
      ],
      [
        ["15:00", "Safari gurun dan matahari terbenam", "Gurun Dubai, Dubai", "wisata"],
        ["19:30", "Makan malam di perkemahan gurun", "Gurun Dubai, Dubai", "kuliner"],
      ],
      [
        ["09:00", "Menuju Abu Dhabi", "Abu Dhabi", "transport"],
        ["11:00", "Masjid Agung Sheikh Zayed", "Abu Dhabi", "wisata"],
        ["15:00", "Louvre Abu Dhabi", "Saadiyat, Abu Dhabi", "wisata"],
      ],
      [
        ["10:00", "Corniche dan oleh-oleh", "Abu Dhabi", "belanja"],
        ["14:00", "Kembali ke bandara", "Bandara Dubai, Dubai", "transport"],
      ],
    ],
  },
  {
    slug: "travo-australia-7-hari-sydney-melbourne",
    code: "AU",
    country: "Australia",
    title: "Australia 7 Hari: Sydney dan Melbourne",
    description:
      "Sydney Opera House dan Bondi, lalu Melbourne dengan Great Ocean Road dan kafe lorong.",
    intro:
      "Sydney identik dengan Opera House dan pantai, sedangkan Melbourne dikenal dengan budaya kafe, seni jalanan, dan jalur pesisir. Tujuh hari cukup untuk keduanya dengan satu penerbangan domestik singkat di antaranya.",
    tips: [
      {
        title: "Periksa persyaratan masuk Australia",
        body: "Persyaratan visa dan izin masuk dapat berubah menurut paspor. Cek situs resmi pemerintah Australia sebelum membeli tiket.",
      },
      {
        title: "Siapkan pakaian berlapis",
        body: "Cuaca Melbourne bisa berubah cepat dalam satu hari.",
      },
      {
        title: "Pesan tur Great Ocean Road lebih awal",
        body: "Tur sehari populer dan jadwalnya bergantung musim. Pesan lebih awal.",
      },
    ],
    faqs: [
      {
        question: "Apakah 7 hari cukup untuk dua kota?",
        answer:
          "Cukup untuk sorotan utama bila kamu menyederhanakan jadwal. Pangkas satu kegiatan bila ingin lebih santai.",
      },
      {
        question: "Bagaimana transportasi antarkota?",
        answer:
          "Penerbangan domestik adalah yang tercepat antara Sydney dan Melbourne. Periksa jadwal dan aturan bagasi.",
      },
    ],
    source: { label: "Tourism Australia", url: "https://www.australia.com/" },
    days: [
      [
        ["08:00", "Tiba di Sydney dan check-in", "Circular Quay, Sydney", "akomodasi"],
        ["15:00", "Opera House dan Botanic Garden", "Circular Quay, Sydney", "wisata"],
        ["19:00", "Makan malam di tepi pelabuhan", "The Rocks, Sydney", "kuliner"],
      ],
      [
        ["09:30", "Harbour Bridge dan The Rocks", "The Rocks, Sydney", "wisata"],
        ["13:00", "Feri ke Manly dan makan siang", "Manly, Sydney", "transport"],
        ["17:00", "Matahari terbenam di pantai", "Manly, Sydney", "wisata"],
      ],
      [
        ["09:30", "Jalur pesisir Bondi ke Coogee", "Bondi, Sydney", "wisata"],
        ["13:00", "Makan siang di Bondi", "Bondi, Sydney", "kuliner"],
        ["17:00", "Terbang ke Melbourne", "Bandara Melbourne, Melbourne", "transport"],
      ],
      [
        ["09:30", "Federation Square dan Lorong seni", "CBD, Melbourne", "wisata"],
        ["13:00", "Kafe di Hosier Lane", "CBD, Melbourne", "kuliner"],
        ["16:00", "Queen Victoria Market", "CBD, Melbourne", "belanja"],
      ],
      [
        ["08:00", "Tur Great Ocean Road", "Great Ocean Road, Victoria", "wisata"],
        ["19:00", "Kembali dan makan malam", "CBD, Melbourne", "kuliner"],
      ],
      [
        ["10:00", "Royal Botanic Gardens", "Southbank, Melbourne", "wisata"],
        ["14:00", "Belanja dan oleh-oleh", "CBD, Melbourne", "belanja"],
        ["18:30", "Makan malam perpisahan", "Southbank, Melbourne", "kuliner"],
      ],
      [
        ["08:00", "Sarapan dan check-out", "CBD, Melbourne", "akomodasi"],
        ["10:00", "Menuju bandara", "Bandara Melbourne, Melbourne", "transport"],
      ],
    ],
  },
  {
    slug: "travo-italia-7-hari-roma-florence-venesia",
    code: "IT",
    country: "Italia",
    title: "Italia 7 Hari: Roma, Florence, Venesia",
    description:
      "Rute klasik Italia: Colosseum dan Vatikan, seni Renaisans Florence, lalu kanal Venesia.",
    intro:
      "Roma, Florence, dan Venesia adalah rute klasik pertama ke Italia: reruntuhan kuno, seni Renaisans, dan kota di atas kanal. Ketiganya terhubung kereta cepat, jadi tujuh hari terasa nyaman bila tiket atraksi dipesan lebih awal.",
    tips: [
      {
        title: "Pesan tiket atraksi populer lebih awal",
        body: "Colosseum, Vatikan, dan Galeri Uffizi sering penuh. Pesan jauh hari di situs resmi.",
      },
      {
        title: "Periksa aturan masuk Schengen",
        body: "Persyaratan visa dan dokumen dapat berubah. Cek sumber resmi sebelum membeli tiket.",
      },
      {
        title: "Gunakan kereta antarkota",
        body: "Kereta cepat antara kota-kota ini praktis dan menghemat waktu dibanding menyetir.",
      },
    ],
    faqs: [
      {
        question: "Apakah 7 hari cukup untuk tiga kota?",
        answer:
          "Cukup untuk sorotan utama: tiga hari Roma, dua hari Florence, dan dua hari Venesia, termasuk perjalanan.",
      },
      {
        question: "Bagaimana berpindah antar kota?",
        answer:
          "Kereta cepat adalah cara termudah. Bandingkan jadwal dan harga tiket di situs operator.",
      },
    ],
    source: { label: "Italia.it: situs wisata resmi", url: "https://www.italia.it/en" },
    days: [
      [
        ["14:00", "Tiba di Roma dan check-in", "Termini, Roma", "akomodasi"],
        ["17:00", "Trevi Fountain dan Spanish Steps", "Roma", "wisata"],
        ["19:30", "Makan malam pasta", "Trastevere, Roma", "kuliner"],
      ],
      [
        ["09:00", "Colosseum dan Forum Romawi", "Roma", "wisata"],
        ["13:00", "Makan siang", "Monti, Roma", "kuliner"],
        ["15:30", "Pantheon dan Piazza Navona", "Roma", "wisata"],
      ],
      [
        ["08:30", "Museum Vatikan dan Basilika Santo Petrus", "Vatikan, Roma", "wisata"],
        ["14:00", "Makan siang dan istirahat", "Roma", "kuliner"],
        ["16:30", "Kereta ke Florence", "Stasiun Santa Maria Novella, Florence", "transport"],
      ],
      [
        ["09:00", "Duomo dan Menara Giotto", "Florence", "wisata"],
        ["13:00", "Makan siang", "Florence", "kuliner"],
        ["15:00", "Galeri Uffizi", "Florence", "wisata"],
      ],
      [
        ["09:30", "Ponte Vecchio dan Piazzale Michelangelo", "Florence", "wisata"],
        ["14:00", "Kereta ke Venesia", "Stasiun Santa Lucia, Venesia", "transport"],
        ["18:00", "Jalan sore di kanal", "Venesia", "wisata"],
      ],
      [
        [
          "09:00",
          "Basilika Santo Markus dan Palazzo Ducale",
          "Piazza San Marco, Venesia",
          "wisata",
        ],
        ["13:00", "Makan siang cicchetti", "Venesia", "kuliner"],
        ["15:30", "Pulau Murano dan Burano", "Laguna Venesia", "wisata"],
      ],
      [
        ["10:00", "Oleh-oleh kaca dan topeng", "Venesia", "belanja"],
        ["13:00", "Menuju bandara", "Bandara Venesia, Venesia", "transport"],
      ],
    ],
  },
];
