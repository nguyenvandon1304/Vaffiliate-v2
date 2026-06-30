import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { parse } from "csv-parse/sync";

import {
SHOPEE_CSV_FIELDS,
SHOPEE_CSV_HEADERS,
SHOPEE_CSV_PARSER_VERSION,
assertShopeeCsvHeaders,
} from "./shopee-csv-contract.mjs";

const SHOPEE_TIME_ZONE_OFFSET = "+07:00";
const MAX_POSTGRES_INTEGER = 2_147_483_647;

function sha256(value) {
return createHash("sha256").update(value).digest("hex");
}

function readRawField(record, header) {
const value = record[header];

if (typeof value !== "string") {
throw new TypeError(
`CSV field "${header}" must contain a string value.`,
);
}

return value;
}

function normalizeNullableText(value) {
const normalized = value.trim();

if (normalized === "" || normalized === "--") {
return null;
}

return normalized;
}

function readNullableText(record, header) {
return normalizeNullableText(readRawField(record, header));
}

function readRequiredText(record, header) {
const value = readNullableText(record, header);

if (value === null) {
throw new Error(
`CSV field "${header}" must not be blank.`,
);
}

return value;
}

function parseNullableInteger(record, header) {
const value = readNullableText(record, header);

if (value === null) {
return null;
}

if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) {
throw new Error(
`CSV field "${header}" is not a valid integer: ` +
`"${value}".`,
);
}

const normalized = value.replaceAll(",", "");
const parsedValue = Number(normalized);

if (
!Number.isSafeInteger(parsedValue) ||
parsedValue > MAX_POSTGRES_INTEGER
) {
throw new Error(
`CSV field "${header}" exceeds the supported ` +
`integer range: "${value}".`,
);
}

return parsedValue;
}

function parseNullableDecimal(record, header) {
const value = readNullableText(record, header);

if (value === null) {
return null;
}

if (
!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,5})?$/.test(value)
) {
throw new Error(
`CSV field "${header}" is not a valid numeric(20,5) ` +
`value: "${value}".`,
);
}

const normalized = value.replaceAll(",", "");

const unsignedValue = normalized.startsWith("-")
? normalized.slice(1)
: normalized;

const [integerPart] = unsignedValue.split(".");

if (integerPart.length > 15) {
throw new Error(
`CSV field "${header}" exceeds numeric(20,5): ` +
`"${value}".`,
);
}

return normalized;
}

function parseNullableDateTime(record, header) {
const value = readNullableText(record, header);

if (value === null) {
return null;
}

const match = value.match(
/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
);

if (match === null) {
throw new Error(
`CSV field "${header}" has an unsupported datetime: ` +
`"${value}".`,
);
}

const [
,
year,
month,
day,
hour,
minute,
second,
] = match;

const localTimestamp =
`${year}-${month}-${day}T` +
`${hour}:${minute}:${second}`;

const parsedDate = new Date(
`${localTimestamp}${SHOPEE_TIME_ZONE_OFFSET}`,
);

if (Number.isNaN(parsedDate.getTime())) {
throw new Error(
`CSV field "${header}" contains an invalid datetime: ` +
`"${value}".`,
);
}

const roundTripLocalTimestamp = new Date(
parsedDate.getTime() + 7 * 60 * 60 * 1000,
)
.toISOString()
.slice(0, 19);

if (roundTripLocalTimestamp !== localTimestamp) {
throw new Error(
`CSV field "${header}" contains an invalid calendar ` +
`datetime: "${value}".`,
);
}

return parsedDate.toISOString();
}

function cloneRawRecord(record) {
return Object.fromEntries(
SHOPEE_CSV_HEADERS.map((header) => [
header,
readRawField(record, header),
]),
);
}

function createRowFingerprint(rawRecord) {
const canonicalValues = SHOPEE_CSV_HEADERS.map(
(header) => rawRecord[header],
);

return sha256(JSON.stringify(canonicalValues));
}

function parseShopeeCsvRow(record, sourceRowNumber) {
const rawRow = cloneRawRecord(record);

return {
sourceRowNumber,
rowFingerprintSha256:
createRowFingerprint(rawRow),
rawRow,
externalOrderId: readRequiredText(
record,
SHOPEE_CSV_FIELDS.externalOrderId,
),
checkoutId: readNullableText(
record,
SHOPEE_CSV_FIELDS.checkoutId,
),
orderStatus: readRequiredText(
record,
SHOPEE_CSV_FIELDS.orderStatus,
),
orderedAt: parseNullableDateTime(
record,
SHOPEE_CSV_FIELDS.orderedAt,
),
completedAt: parseNullableDateTime(
record,
SHOPEE_CSV_FIELDS.completedAt,
),
clickedAt: parseNullableDateTime(
record,
SHOPEE_CSV_FIELDS.clickedAt,
),
shopId: readNullableText(
record,
SHOPEE_CSV_FIELDS.shopId,
),
itemId: readNullableText(
record,
SHOPEE_CSV_FIELDS.itemId,
),
modelId: readNullableText(
record,
SHOPEE_CSV_FIELDS.modelId,
),
promotionId: readNullableText(
record,
SHOPEE_CSV_FIELDS.promotionId,
),
quantity: parseNullableInteger(
record,
SHOPEE_CSV_FIELDS.quantity,
),
orderValue: parseNullableDecimal(
record,
SHOPEE_CSV_FIELDS.orderValue,
),
refundedAmount: parseNullableDecimal(
record,
SHOPEE_CSV_FIELDS.refundedAmount,
),
totalProductCommission: parseNullableDecimal(
record,
SHOPEE_CSV_FIELDS.totalProductCommission,
),
totalOrderCommission: parseNullableDecimal(
record,
SHOPEE_CSV_FIELDS.totalOrderCommission,
),
netAffiliateCommission: parseNullableDecimal(
record,
SHOPEE_CSV_FIELDS.netAffiliateCommission,
),
linkedProductStatus: readNullableText(
record,
SHOPEE_CSV_FIELDS.linkedProductStatus,
),
sourceSubId1: readNullableText(
record,
SHOPEE_CSV_FIELDS.sourceSubId1,
),
sourceSubId2: readNullableText(
record,
SHOPEE_CSV_FIELDS.sourceSubId2,
),
sourceSubId3: readNullableText(
record,
SHOPEE_CSV_FIELDS.sourceSubId3,
),
sourceSubId4: readNullableText(
record,
SHOPEE_CSV_FIELDS.sourceSubId4,
),
sourceSubId5: readNullableText(
record,
SHOPEE_CSV_FIELDS.sourceSubId5,
),
channel: readNullableText(
record,
SHOPEE_CSV_FIELDS.channel,
),
};
}

export function parseShopeeCsvBuffer(
input,
{
sourceFileName = "shopee-affiliate-report.csv",
} = {},
) {
const buffer = Buffer.isBuffer(input)
? input
: Buffer.from(input, "utf8");

let sourceHeaders = null;

const parsedRecords = parse(buffer, {
bom: true,
columns(headers) {
assertShopeeCsvHeaders(headers);
sourceHeaders = [...headers];

  return headers;
},
info: true,
relax_column_count: false,
skip_empty_lines: true,
trim: false,

});

if (sourceHeaders === null) {
throw new Error(
"The Shopee CSV file does not contain a header row.",
);
}

const rows = parsedRecords.map(
({ record, info }, index) =>
parseShopeeCsvRow(
record,
Number.isInteger(info?.lines)
? info.lines
: index + 2,
),
);

return {
parserVersion: SHOPEE_CSV_PARSER_VERSION,
sourceFileName: basename(sourceFileName),
sourceFileSizeBytes: buffer.byteLength,
sourceFileSha256: sha256(buffer),
sourceHeaders,
rows,
};
}

export async function parseShopeeCsvFile(filePath) {
const buffer = await readFile(filePath);

return parseShopeeCsvBuffer(buffer, {
sourceFileName: basename(filePath),
});
}
