# 📝 المستند الفني الشامل للنظام المالي

## 1. نظرة عامة

هذا المستند يقدم تحليلاً شاملاً وعميقًا للبنية المالية الكاملة للنظام، بهدف توحيد المفاهيم وتجهيز البنية التحتية لتطوير ميزات محاسبية متقدمة مثل **كشف الحساب الموحد**، **شجرة الحسابات الديناميكية**، و **نظام الأستاذ العام (Ledger)**.

**قاعدة البيانات المستخدمة:** `Cloud Firestore` (قاعدة بيانات NoSQL).

---

## 2. 🧱 الهيكل العام للعمليات المالية

جميع العمليات المالية في النظام، بغض النظر عن مصدرها (تذكرة، فيزا، سند، اشتراك)، يتم توحيدها وتسجيلها كـ **قيد محاسبي مزدوج (Double-entry bookkeeping)** في جدول مركزي واحد هو:

*   **الجدول المحوري:** `journal-vouchers`

هذا يعني أن كل عملية مالية لها طرف **مدين (Debit)** وطرف **دائن (Credit)**، ومجموع المبالغ المدينة يجب أن يساوي دائمًا مجموع المبالغ الدائنة.

### هيكل السجل المحاسبي (`JournalVoucher`)

هذا هو النموذج الأساسي الذي يمثل أي حركة مالية في النظام.

```typescript
// File: src/lib/types.ts

export interface JournalEntry {
    accountId: string; // معرف الحساب (من شجرة الحسابات)
    amount: number;    // المبلغ
    description: string; // وصف للحركة
}

export interface JournalVoucher {
    id: string;
    invoiceNumber: string; // رقم تسلسلي فريد (مثال: JV-00123)
    date: string;          // تاريخ العملية (ISO String)
    currency: Currency;
    exchangeRate: number | null;
    notes: string;         // وصف عام للسند
    createdBy: string;     // UID للمستخدم الذي أنشأ السند
    officer: string;       // اسم المستخدم
    voucherType: string;   // نوع السند المصدر (booking, visa, payment, etc.)
    debitEntries: JournalEntry[];  // الحسابات المدينة
    creditEntries: JournalEntry[]; // الحسابات الدائنة
    isAudited: boolean;    // هل تم تدقيق السند؟
    isConfirmed: boolean;  // هل تم تأكيد العملية؟
    originalData?: any;   // البيانات الأصلية من النموذج المصدر
}
```

---

## 3. 🧾 السندات والحركات المالية

كل سند يتم إنشاؤه من واجهات المستخدم المختلفة (سند قبض، دفع، مصاريف) يتم تحويله إلى قيد محاسبي مزدوج وحفظه في جدول `journal-vouchers`.

### أ. آلية عمل السندات (ملفات `actions`)

الكود المسؤول عن إنشاء هذه القيود موجود في الملفات التالية:

*   **سند القبض العادي:** `src/app/accounts/vouchers/standard/actions.ts`
*   **سند الدفع:** `src/app/accounts/vouchers/payment/actions.ts`
*   **سند المصاريف:** `src/app/accounts/vouchers/expense/actions.ts`
*   **القيد المحاسبي اليدوي:** `src/app/accounts/vouchers/journal/actions.ts`
*   **سند القبض المخصص (الموزع):** `src/app/accounts/vouchers/distributed/actions.ts`

**مثال: آلية عمل سند القبض العادي**

عند إنشاء سند قبض من عميل وإيداعه في صندوق "الصندوق الرئيسي"، تقوم دالة `createStandardReceipt` بتنفيذ الآتي:

1.  تنشئ قيدًا محاسبيًا جديدًا في `journal-vouchers`.
2.  **الطرف المدين (Debit):** يكون حساب "الصندوق الرئيسي" (لأنه استلم الأموال).
3.  **الطرف الدائن (Credit):** يكون حساب "العميل" (لأن رصيده الدائن لدينا انخفض).

```typescript
// من ملف: src/app/accounts/vouchers/standard/actions.ts

// ...
batch.set(journalVoucherRef, {
    // ...
    voucherType: "journal_from_standard_receipt",
    debitEntries: [{
        accountId: data.toBox, // الصندوق (مدين)
        amount: data.amount,
        description: 'إيداع في الصندوق'
    }],
    creditEntries: [{
        accountId: data.from, // العميل (دائن)
        amount: data.amount,
        description: 'سداد دفعة'
    }],
    // ...
});
// ...
```

**ملاحظة مهمة:** **نعم، كل سند يتم تسجيله في دفتر الأستاذ** (جدول `journal-vouchers`) بدون استثناء.

---

## 4. 🪜 الشجرة المحاسبية (Chart of Accounts)

حاليًا، لا يوجد جدول مخصص ومنفصل للشجرة المحاسبية. يتم بناؤها بشكل **ضمني (Implicit)** من عدة جداول مختلفة.

### أ. نموذج الحساب (Account)

لا يوجد `interface Account` صريح وموحد. بدلاً من ذلك، كل نوع من الحسابات له `interface` خاص به:

*   **العملاء والموردين:** `Client` / `Supplier` (من جدول `clients`)
*   **الصناديق:** `Box` (من جدول `boxes`)
*   **البورصات:** `Exchange` (من جدول `exchanges`)
*   **حسابات الإيرادات والمصروفات:** يتم تعريفها كنصوص ثابتة (Hardcoded Strings) مثل `revenue_tickets`, `expense_visa`.

**مقترح للتطوير:** يجب إنشاء جدول مركزي `accounts` يحتوي على جميع الحسابات لإنشاء شجرة محاسبية ديناميكية. النموذج المقترح ممتاز:

```typescript
// نموذج مقترح ومثالي للمستقبل
interface Account {
  id: string;      // ex: '1201001'
  name: string;    // ex: 'صندوق بغداد'
  code: string;    // ex: '1201001'
  parentId?: string; // ex: '1201' (حساب الصناديق)
  type: "الأصول" | "الخصوم" | "الإيرادات" | "المصروفات" | "حقوق الملكية";
  currency: Currency;
  hasSubAccounts: boolean;
}
```

### ب. دالة استرجاع الحسابات

حاليًا، يتم جلب كل نوع من الحسابات من جدوله الخاص عبر دوال منفصلة ثم تجميعها في الواجهة.

*   `getClients()` من `src/app/relations/actions.ts`
*   `getSuppliers()` من `src/app/suppliers/actions.ts`
*   `getBoxes()` من `src/app/boxes/actions.ts`
*   `getExchanges()` من `src/app/exchanges/actions.ts`

**ملاحظة مهمة:** **نعم، كل عملية مالية (كل `JournalEntry`) مربوطة بـ `accountId`**. هذا هو المفتاح لربط الحركات المالية بالشجرة المحاسبية.

---

## 5. 📊 كشف الحساب

### أ. الكود الكامل لصفحة كشف الحساب

الكود موجود في ملف `src/app/reports/account-statement/components/report-generator.tsx`. هذا المكون مسؤول عن عرض الفلاتر وجلب البيانات وعرض الجدول والملخص.

### ب. الدالة التي تجلب العمليات

الدالة الرئيسية هي `getAccountStatement` الموجودة في ملف `src/app/reports/actions.ts`.

تقوم هذه الدالة بالخطوات التالية:
1.  تحديد نوع الحساب المطلوب (عميل، مورد، صندوق، بورصة...).
2.  جلب **جميع** السجلات من `journal-vouchers`.
3.  فلترة السجلات للعثور فقط على الحركات التي يكون فيها الحساب المطلوب طرفًا مدينًا أو دائنًا.
4.  فلترة النتائج حسب نطاق التاريخ المحدد.
5.  حساب الرصيد الافتتاحي والرصيد الختامي.
6.  إرجاع قائمة بالعمليات مع الرصيد المتراكم.

### ج. الأعمدة الحالية في الكشف

*   التاريخ (`date`)
*   النوع (`type` - مثل: سند قبض، فاتورة حجز)
*   البيان (`description`)
*   مدين (`debit`)
*   دائن (`credit`)
*   الرصيد (`balance`)
*   العملة (`currency`)
*   الموظف (`officer`)
*   الإجراءات (تعديل، حذف)

---

## 6. 🏦 الصناديق والعملات

*   **ملف الصناديق:** الكود موجود في `src/app/boxes/actions.ts`. يتم تخزين الصناديق في جدول `boxes`.
*   **ملف العملات:** لا يوجد جدول منفصل للعملات. يتم تعريفها وإدارتها ضمن ملف الإعدادات العامة `AppSettings`.
*   **نظام سعر الصرف:** يوجد سعر صرف ثابت (حالياً `USD` إلى `IQD`) يتم تخزينه أيضًا في ملف الإعدادات العامة ويمكن تعديله من واجهة الإعدادات.

---

## 7. ⚙️ ملفات عامة

### أ. ملف `types.ts`

هذا هو المحتوى الكامل للملف `src/lib/types.ts`، وهو يحتوي على جميع نماذج البيانات في النظام.

```typescript
// المحتوى الكامل لملف src/lib/types.ts موجود هنا
// ... (تم إرفاق المحتوى الكامل في الاستجابة السابقة) ...
import type { ReconciliationResult, ReconciliationSettings, FilterRule } from './reconciliation';
import type { ThemeConfig } from './themes';
import { COUNTRIES_DATA } from './countries-data';
import { parseISO } from 'date-fns';

export type Currency = "USD" | "IQD" | string;

export type Box = {
  id: string;
  name: string;
  openingBalanceUSD: number;
  openingBalanceIQD: number;
};

// ... (باقي الأنواع كما هي موجودة في الملف) ...

export type JournalEntry = {
    accountId: string;
    amount: number;
    description: string;
}

export type JournalVoucher = {
    id: string;
    invoiceNumber: string;
    date: string; // ISO string
    currency: Currency;
    exchangeRate: number | null;
    notes: string;
    createdBy: string;
    officer: string;
    createdAt: string; // ISO string
    updatedAt: string; // ISO string
    voucherType: string;
    voucherTypeLabel?: string;
    debitEntries: JournalEntry[];
    creditEntries: JournalEntry[];
    isAudited: boolean;
    isConfirmed: boolean;
    isDeleted?: boolean;
    deletedAt?: string;
    originalData?: any; // To store original form data if needed for display
};

// ... وهكذا مع باقي الأنواع ...
```

### ب. ملف الإعدادات العامة (`AppSettings`)

نعم، ملف الإعدادات العامة يحتوي على إعدادات مالية هامة. يتم جلبها عبر دالة `getSettings` من ملف `src/app/settings/actions.ts`. أهم الإعدادات المالية فيه هي:

*   `currencySettings`: لإدارة العملات وأسعار الصرف.
*   `voucherSettings`: لإدارة إعدادات السندات المختلفة.
*   `invoiceSequenceSettings`: لإدارة تسلسل أرقام الفواتير.

---

## 8. 📄 شرح الصفحات وآلية عملها

### أ. السندات بأنواعها (قبض، دفع، مصاريف، قيد)
*   **آلية العمل:** كل سند له نموذج خاص به. عند الحفظ، يتم استدعاء دالة `action` خاصة به (مثال: `createStandardReceipt`) تقوم بإنشاء قيد محاسبي مزدوج متوازن في جدول `journal-vouchers`.
*   **مثال (سند دفع):** الطرف المدين هو حساب المورد (لأن دينه لدينا قل)، والطرف الدائن هو حساب الصندوق (لأن أمواله نقصت).

### ب. تذاكر الطيران (`bookings`)
*   **آلية العمل:** عند إنشاء حجز، يتم إنشاء قيد مركب من 4 حركات:
    1.  **مدين:** حساب العميل (بكامل قيمة التذكرة).
    2.  **مدين:** حساب "مصروفات التذاكر" (بتكلفة التذكرة).
    3.  **دائن:** حساب المورد (بتكلفة التذكرة).
    4.  **دائن:** حساب "إيرادات التذاكر" (بكامل قيمة التذكرة).

### ج. طلبات الفيزا (`visas`)
*   **آلية العمل:** نفس آلية تذاكر الطيران تمامًا، ولكن باستخدام حسابات "مصروفات الفيزا" و "إيرادات الفيزا".

### د. الاشتراكات (`subscriptions`)
*   **آلية العمل:** عند إنشاء اشتراك، يتم إنشاء قيد مماثل للتذاكر لإثبات المديونية على العميل والإيراد للشركة. عند دفع كل قسط، يتم إنشاء **سند قبض** منفصل لتسوية جزء من دين العميل.

### هـ. الحوالات (`remittances`)
*   **آلية العمل:** عند "استلام" الحوالة، يتم إنشاء سند قبض تلقائيًا، حيث يكون الطرف المدين هو الصندوق المحدد، والطرف الدائن هو حساب مؤقت يمثل "مصدر الحوالة".

### و. السكمنت (`segments`)
*   **آلية العمل:** عند إنشاء سجل سكمنت، يتم إنشاء **3 قيود محاسبية** تلقائيًا:
    1.  قيد لإثبات **كامل الربح كدين على العميل**.
    2.  قيد **صرف حصص الشركاء** من الصندوق إلى حساباتهم.
    3.  قيد داخلي **لإثبات حصة الشركة** كإيراد فعلي.

### ز. توزيع الحصص (`profit-sharing`)
*   **آلية العمل:** عند توزيع أرباح فترة يدوية، يتم إنشاء قيود صرف من الصندوق المحدد إلى حسابات الشركاء، بالإضافة إلى قيد إثبات حصة الشركة.

### ح. البورصات (`exchanges`)
*   **آلية العمل:** كل معاملة (دين أو تسديد) يتم تسجيلها كدفعة (`batch`) في جداول خاصة (`exchange_transaction_batches`, `exchange_payment_batches`). يتم عرضها في كشف حساب البورصة الموحد.

### ط. تحليل بيانات الطيران (`flight-analysis`)
*   **آلية العمل:** هذه الأداة لا تنشئ قيودًا محاسبية مباشرة. هي أداة تحليلية فقط تقوم بمعالجة ملفات Excel وتخزين النتائج في جدول `flight_reports` لأغراض التدقيق والمقارنة.

---

بهذا المستند، لديك الآن خريطة طريق واضحة وكاملة للنظام المالي، مما يمكننا من الانطلاق في تطوير الميزات المحاسبية المتقدمة بثقة ودقة.

---

## 🔗 ملحق: تفاصيل إضافية للنظام المحاسبي

هذا الملحق يحتوي على الإضافات التي طلبتها لضمان وضوح كامل قبل البدء بالتطوير.

### 1. جدول القيود المحاسبية لكل عملية

| نوع العملية (voucherType) | الحساب المدين (Debit) | الحساب الدائن (Credit) | ملاحظات |
| :--- | :--- | :--- | :--- |
| `journal_from_standard_receipt` | الصندوق (toBox) | العميل (from) | يتم إنشاؤه من سند القبض العادي. |
| `journal_from_payment` | المورد (toSupplierId) | الصندوق (boxId) | يتم إنشاؤه من سند الدفع. |
| `journal_from_expense` | حساب المصروف (expense_xyz) | الصندوق (boxId) | يتم إنشاؤه من سند المصاريف. |
| `journal_voucher` | حسابات متعددة | حسابات متعددة | يتم إنشاؤه من سند القيد اليدوي. |
| `booking` (تذكرة) | العميل (clientId)، مصروف التذاكر | المورد (supplierId)، إيراد التذاكر | قيد مركب من أربعة أطراف. |
| `visa` (فيزا) | العميل (clientId)، مصروف الفيزا | المورد (supplierId)، إيراد الفيزا | قيد مركب من أربعة أطراف. |
| `subscription` (اشتراك) | العميل (clientId) | إيراد الاشتراكات | قيد لإثبات الدين والإيراد عند الإنشاء. |
| `journal_from_installment` | الصندوق (boxId) | العميل (clientId) | قيد سند قبض عند تسديد كل قسط. |
| `journal_from_remittance` | الصندوق (boxId) | حساب مصدر الحوالة | يتم إنشاؤه عند استلام الحوالة. |
| `segment` (سكمنت) | العميل (clientId) | إيراد السكمنت | قيد لإثبات إجمالي ربح السكمنت كدين. |
| `profit-sharing` (توزيع حصص) | حساب الشريك (partnerId) | الصندوق (boxId) | قيد صرف حصة كل شريك. |

---

### 2. هيكل الشجرة المحاسبية المقترح

هذا هو الهيكل المقترح الذي سنعتمده. سيتم إنشاء جدول مركزي `accounts` لتخزين هذه الشجرة بشكل ديناميكي.

```json
{
  "1": { "name": "الأصول", "code": "1", "type": "main", "children": {
    "10": { "name": "الأصول المتداولة", "code": "10", "type": "group", "children": {
      "100": { "name": "الصناديق والبنوك", "code": "100", "type": "group" },
      "101": { "name": "الذمم المدينة (العملاء)", "code": "101", "type": "group" },
      "102": { "name": "البورصات", "code": "102", "type": "group" }
    }}
  }},
  "2": { "name": "الخصوم", "code": "2", "type": "main", "children": {
    "20": { "name": "الخصوم المتداولة", "code": "20", "type": "group", "children": {
      "200": { "name": "الذمم الدائنة (الموردين)", "code": "200", "type": "group" }
    }}
  }},
  "3": { "name": "حقوق الملكية", "code": "3", "type": "main" },
  "4": { "name": "الإيرادات", "code": "4", "type": "main", "children": {
    "400": { "name": "إيرادات النشاط الرئيسي", "code": "400", "type": "group", "children": {
      "4000": { "name": "إيرادات تذاكر الطيران", "id": "revenue_tickets", "code": "4000", "type": "account" },
      "4001": { "name": "إيرادات الفيزا", "id": "revenue_visa", "code": "4001", "type": "account" },
      "4002": { "name": "إيرادات الاشتراكات", "id": "revenue_subscriptions", "code": "4002", "type": "account" },
      "4003": { "name": "إيرادات السكمنت", "id": "revenue_segments", "code": "4003", "type": "account" },
      "4004": { "name": "إيرادات توزيع الأرباح", "id": "revenue_profit_distribution", "code": "4004", "type": "account" },
      "4005": { "name": "إيرادات رسوم الاسترجاع والتغيير", "id": "revenue_fees", "code": "4005", "type": "account" }
    }}
  }},
  "5": { "name": "المصروفات", "code": "5", "type": "main", "children": {
    "500": { "name": "تكاليف النشاط الرئيسي", "code": "500", "type": "group", "children": {
      "5000": { "name": "تكلفة تذاكر الطيران", "id": "expense_tickets", "code": "5000", "type": "account" },
      "5001": { "name": "تكلفة الفيزا", "id": "expense_visa", "code": "5001", "type": "account" },
      "5002": { "name": "تكلفة الاشتراكات", "id": "expense_subscriptions", "code": "5002", "type": "account" }
    }},
    "501": { "name": "المصروفات التشغيلية", "code": "501", "type": "group" }
  }}
}
```

---

### 3. مثال لسجل `journal-vouchers` من Firestore

هذا مثال لسجل محاسبي ناتج عن إنشاء **سند قبض عادي**.

```json
{
  "id": "abc123xyz456",
  "invoiceNumber": "RC-000101",
  "date": "2024-05-20T10:00:00.000Z",
  "currency": "USD",
  "exchangeRate": null,
  "notes": "دفعة من حساب شهر 5",
  "createdBy": "uid_of_user_1",
  "officer": "Ali Ahmed",
  "createdAt": "2024-05-20T10:00:05.123Z",
  "updatedAt": "2024-05-20T10:00:05.123Z",
  "voucherType": "journal_from_standard_receipt",
  "isAudited": true,
  "isConfirmed": true,
  "debitEntries": [
    {
      "accountId": "box_main_id",
      "amount": 500,
      "description": "إيداع في الصندوق"
    }
  ],
  "creditEntries": [
    {
      "accountId": "client_id_456",
      "amount": 500,
      "description": "سداد دفعة"
    }
  ],
  "originalData": {
    "date": "2024-05-20T10:00:00.000Z",
    "from": "client_id_456",
    "toBox": "box_main_id",
    "amount": 500,
    "currency": "USD",
    "details": "دفعة من حساب شهر 5"
  }
}
```

---

بهذه الإضافات، أصبح المستند الآن جاهزًا تمامًا للانطلاق في بناء الميزات المحاسبية المتقدمة.