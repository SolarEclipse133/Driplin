/**
 * LCRA Hydromet SOAP client.
 *
 * Service: https://hydrometdata.lcra.org/service.asmx (classic ASMX
 * SOAP; WSDL at https://hydrometdata.lcra.org/?WSDL). Operation
 * GetLakeLevelPercent returns "Combined Storage values" for Lakes
 * Travis and Buchanan:
 *   <WaterLevelPercent>93%</WaterLevelPercent>
 *   <WaterLevelText>...currently hold about 1,871,442 acre-feet...</WaterLevelText>
 * We parse the acre-feet number out of the text and keep the raw
 * strings for auditability.
 */

export interface LcraReading {
  acreFeet: number;
  percentText: string;
  rawText: string;
  readAt: string; // ISO timestamp of when WE pulled it
}

const ENDPOINT = "https://hydrometdata.lcra.org/service.asmx";
const SOAP_ACTION = "http://hydrometdata.lcra.org/GetLakeLevelPercent";

const REQUEST_BODY = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetLakeLevelPercent xmlns="http://hydrometdata.lcra.org" />
  </soap:Body>
</soap:Envelope>`;

export class LcraError extends Error {}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

export async function fetchLcraCombinedStorage(): Promise<LcraReading> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${SOAP_ACTION}"`,
      },
      body: REQUEST_BODY,
      cache: "no-store",
    });
  } catch {
    throw new LcraError("Could not reach LCRA Hydromet (network error).");
  }
  if (!res.ok) {
    throw new LcraError(`LCRA Hydromet returned HTTP ${res.status}.`);
  }

  const xml = await res.text();
  const percent = extractTag(xml, "WaterLevelPercent");
  const text = extractTag(xml, "WaterLevelText");
  if (!percent || !text) {
    throw new LcraError("LCRA response did not contain the expected fields.");
  }

  // "…hold about 1,871,442 acre-feet of water." → 1871442
  const acreFeetMatch = text.match(/([\d,]{6,})\s*acre-feet/i);
  if (!acreFeetMatch) {
    throw new LcraError(
      `Could not find an acre-feet figure in LCRA's text: "${text}"`
    );
  }
  const acreFeet = Number(acreFeetMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(acreFeet) || acreFeet <= 0) {
    throw new LcraError(`Parsed an implausible acre-feet value: ${acreFeet}`);
  }

  return {
    acreFeet,
    percentText: percent,
    rawText: text,
    readAt: new Date().toISOString(),
  };
}
