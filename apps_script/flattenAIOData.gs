/**
 * Mailchimp AIO Dashboard — post-processing / aggregation script
 *
 * Lives in: Google Sheet "MC SERP Performance"
 *   https://docs.google.com/spreadsheets/d/1aLqZah8Frx8uVhvu3q55cCFfxUz6ZV7H8jlcKRlDFp0/edit
 *   Extensions → Apps Script (project "MC SERP Performance")
 *
 * What it does:
 *   - Reads raw SERP-API output from the "Results" tab (which is populated by
 *     a *separate* mechanism — location TBD as of 2026-06-15)
 *   - Writes flattened per-row data to "looker_data"
 *   - Writes daily aggregates to "looker_summary"  (gviz gid 1479179188 — read by the dashboard)
 *   - Writes per-keyword aggregates to "looker_ngram" (gviz gid 1189851907 — read by the dashboard)
 *
 * Trigger:
 *   - Time-based, weekly on Wednesday
 *   - As of 2026-06-15 the trigger is DISABLED because its owner (Brooke Sikora)
 *     left DEPT and her Google account was deactivated. Needs to be recreated
 *     under an active DEPT account.
 *
 * This file is a mirror of the live script — if you edit the live script in
 * the Apps Script editor, please also update this file and commit. Likewise
 * if you edit this file, paste it back into the Apps Script editor and Save.
 */

function flattenAIOData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ss.getSheetByName("Results") || ss.getSheets()[0];

  let out = ss.getSheetByName("looker_data");
  if (!out) out = ss.insertSheet("looker_data");
  else out.clearContents();

  const headers = [
    "run_date", "keyword",
    "aio_showing", "any_ads_showing", "ads_above_aio", "organic_above_aio",
    "mailchimp_in_aio", "mailchimp_aio_rank",
    "mailchimp_in_organic", "mailchimp_organic_rank",
    "mailchimp_in_ads", "mailchimp_ad_rank",
    "brevo_in_aio", "brevo_aio_rank",
    "klaviyo_in_aio", "klaviyo_aio_rank",
    "hubspot_in_aio", "hubspot_aio_rank",
    "mailerlite_in_aio", "mailerlite_aio_rank",
    "activecampaign_in_aio", "activecampaign_aio_rank",
    "constantcontact_in_aio", "constantcontact_aio_rank",
    "omnisend_in_aio", "omnisend_aio_rank",
    "aio_total_citations", "ads_total_count", "organic_total_count",
    "top_organic_1", "top_organic_2", "top_organic_3"
  ];

  const rows = source.getDataRange().getValues();
  const srcHeaders = rows[0];
  const col = name => srcHeaders.indexOf(name);

  const b = val => (val === true || val === "TRUE" || val === 1) ? 1 : 0;

  const COMPETITORS = [
    { key: "brevo",           name: "Brevo" },
    { key: "klaviyo",         name: "Klaviyo" },
    { key: "hubspot",         name: "HubSpot" },
    { key: "mailerlite",      name: "MailerLite" },
    { key: "activecampaign",  name: "ActiveCampaign" },
    { key: "constantcontact", name: "Constant Contact" },
    { key: "omnisend",        name: "Omnisend" },
  ];

  function getRank(str, company) {
    if (!str) return "";
    const re = new RegExp("(\\d+):\\s*" + company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    const m = str.match(re);
    return m ? parseInt(m[1]) : "";
  }

  function isCited(str, company) {
    return getRank(str, company) !== "" ? 1 : 0;
  }

  const output = [headers];
  const byDate = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[col("Timestamp")]) continue;

    const ts = r[col("Timestamp")];
    const date = ts instanceof Date
      ? Utilities.formatDate(ts, "UTC", "yyyy-MM-dd")
      : String(ts).substring(0, 10);

    const aioStr = String(r[col("AIO citation ranking")] || "");
    const orgStr = String(r[col("Organic Rankings")] || "");
    const adStr  = String(r[col("Ads overall ranking")] || "");

    let aioCitations = 0, adsTotal = 0, orgTotal = 0;
    let org1 = "", org2 = "", org3 = "";
    try {
      const payload = JSON.parse(r[col("JSON Payload")]);
      aioCitations = (payload.ai_overview_analysis?.cited_companies || []).length;
      adsTotal     = payload.serp_structure_above_aio?.count_ads_total || 0;
      orgTotal     = payload.serp_structure_above_aio?.count_organic_total || 0;
      const tops   = payload.organic_analysis?.top_results || [];
      org1 = tops[0]?.source || "";
      org2 = tops[1]?.source || "";
      org3 = tops[2]?.source || "";
    } catch(e) {}

    const row = [
      date,
      r[col("Keyword")],
      b(r[col("AIO is showing")]),
      b(r[col("Any ads showing")]),
      b(r[col("Ads above AIO")]),
      b(r[col("Organic above AIO")]),
      isCited(aioStr, "Mailchimp"), getRank(aioStr, "Mailchimp"),
      isCited(orgStr, "Mailchimp"), getRank(orgStr, "Mailchimp"),
      isCited(adStr,  "Mailchimp"), getRank(adStr,  "Mailchimp"),
    ];

    COMPETITORS.forEach(c => {
      row.push(isCited(aioStr, c.name), getRank(aioStr, c.name));
    });

    row.push(aioCitations, adsTotal, orgTotal, org1, org2, org3);
    output.push(row);

    if (!byDate[date]) {
      byDate[date] = {
        total: 0,
        aio_showing: 0, any_ads: 0, ads_above: 0,
        mc_aio: 0, mc_organic: 0, mc_ads: 0,
        mc_aio_rank_sum: 0, mc_aio_rank_count: 0,
        mc_organic_rank_sum: 0, mc_organic_rank_count: 0,
        brevo: 0, klaviyo: 0, hubspot: 0, mailerlite: 0,
        activecampaign: 0, constantcontact: 0, omnisend: 0
      };
    }

    const d = byDate[date];
    d.total++;
    d.aio_showing      += b(r[col("AIO is showing")]);
    d.any_ads          += b(r[col("Any ads showing")]);
    d.ads_above        += b(r[col("Ads above AIO")]);
    d.mc_aio           += isCited(aioStr, "Mailchimp");
    d.mc_organic       += isCited(orgStr, "Mailchimp");
    d.mc_ads           += isCited(adStr,  "Mailchimp");

    const mcAioRank = getRank(aioStr, "Mailchimp");
    if (mcAioRank !== "") { d.mc_aio_rank_sum += mcAioRank; d.mc_aio_rank_count++; }

    const mcOrgRank = getRank(orgStr, "Mailchimp");
    if (mcOrgRank !== "") { d.mc_organic_rank_sum += mcOrgRank; d.mc_organic_rank_count++; }

    d.brevo            += isCited(aioStr, "Brevo");
    d.klaviyo          += isCited(aioStr, "Klaviyo");
    d.hubspot          += isCited(aioStr, "HubSpot");
    d.mailerlite       += isCited(aioStr, "MailerLite");
    d.activecampaign   += isCited(aioStr, "ActiveCampaign");
    d.constantcontact  += isCited(aioStr, "Constant Contact");
    d.omnisend         += isCited(aioStr, "Omnisend");
  }

  out.getRange(1, 1, output.length, headers.length).setValues(output);

  // looker_summary tab
  let summary = ss.getSheetByName("looker_summary");
  if (!summary) summary = ss.insertSheet("looker_summary");
  else summary.clearContents();

  const summaryHeaders = [
    "run_date", "total_keywords",
    "aio_presence_rate", "any_ads_rate", "ads_above_aio_rate",
    "mailchimp_aio_rate", "mailchimp_organic_rate", "mailchimp_ad_rate",
    "mailchimp_avg_aio_rank", "mailchimp_avg_organic_rank",
    "brevo_aio_rate", "klaviyo_aio_rate", "hubspot_aio_rate",
    "mailerlite_aio_rate", "activecampaign_aio_rate",
    "constantcontact_aio_rate", "omnisend_aio_rate"
  ];

  const summaryRows = [summaryHeaders];
  Object.keys(byDate).sort().forEach(date => {
    const d = byDate[date];
    const t = d.total;
    const pct = n => parseFloat((n / t * 100).toFixed(2));
    summaryRows.push([
      date, t,
      pct(d.aio_showing), pct(d.any_ads), pct(d.ads_above),
      pct(d.mc_aio), pct(d.mc_organic), pct(d.mc_ads),
      d.mc_aio_rank_count > 0 ? parseFloat((d.mc_aio_rank_sum / d.mc_aio_rank_count).toFixed(2)) : "",
      d.mc_organic_rank_count > 0 ? parseFloat((d.mc_organic_rank_sum / d.mc_organic_rank_count).toFixed(2)) : "",
      pct(d.brevo), pct(d.klaviyo), pct(d.hubspot),
      pct(d.mailerlite), pct(d.activecampaign),
      pct(d.constantcontact), pct(d.omnisend)
    ]);
  });

  summary.getRange(1, 1, summaryRows.length, summaryHeaders.length).setValues(summaryRows);

  // looker_ngram tab
  buildNgramSummary();

  SpreadsheetApp.getUi().alert("Done! " + (output.length - 1) + " rows in looker_data, " + (summaryRows.length - 1) + " rows in looker_summary.");
}

function buildNgramSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ss.getSheetByName("looker_data");
  if (!source) return;

  let out = ss.getSheetByName("looker_ngram");
  if (!out) out = ss.insertSheet("looker_ngram");
  else out.clearContents();

  const headers = [
    "keyword", "ngram", "scans",
    "aio_showing_rate", "mc_aio_rate", "mc_aio_avg_rank",
    "mc_organic_rate", "mc_organic_avg_rank", "mc_ads_rate",
    "brevo_aio_rate", "klaviyo_aio_rate", "mailerlite_aio_rate",
    "omnisend_aio_rate", "hubspot_aio_rate", "activecampaign_aio_rate",
    "constantcontact_aio_rate", "ads_above_aio_rate", "top_organic_1"
  ];

  const rows = source.getDataRange().getValues();
  const h = rows[0];
  const col = name => h.indexOf(name);

  const byKw = {};

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const kw = String(r[col("keyword")] || "").trim().toLowerCase();
    if (!kw) continue;
    const n = kw.split(/\s+/).length;

    if (!byKw[kw]) {
      byKw[kw] = {
        keyword: kw, ngram: n, scans: 0,
        aio: 0, mc_aio: 0, mc_aio_r: [], mc_org: 0, mc_org_r: [],
        mc_ads: 0, brevo: 0, klaviyo: 0, mailerlite: 0,
        omnisend: 0, hubspot: 0, activecampaign: 0, constantcontact: 0,
        ads_above: 0, top1: ""
      };
    }

    const d = byKw[kw];
    d.scans++;
    d.aio            += parseInt(r[col("aio_showing")]) || 0;
    d.mc_aio         += parseInt(r[col("mailchimp_in_aio")]) || 0;
    d.mc_org         += parseInt(r[col("mailchimp_in_organic")]) || 0;
    d.mc_ads         += parseInt(r[col("mailchimp_in_ads")]) || 0;
    d.brevo          += parseInt(r[col("brevo_in_aio")]) || 0;
    d.klaviyo        += parseInt(r[col("klaviyo_in_aio")]) || 0;
    d.mailerlite     += parseInt(r[col("mailerlite_in_aio")]) || 0;
    d.omnisend       += parseInt(r[col("omnisend_in_aio")]) || 0;
    d.hubspot        += parseInt(r[col("hubspot_in_aio")]) || 0;
    d.activecampaign += parseInt(r[col("activecampaign_in_aio")]) || 0;
    d.constantcontact+= parseInt(r[col("constantcontact_in_aio")]) || 0;
    d.ads_above      += parseInt(r[col("ads_above_aio")]) || 0;

    const ar = parseFloat(r[col("mailchimp_aio_rank")]);
    if (ar) d.mc_aio_r.push(ar);
    const or = parseFloat(r[col("mailchimp_organic_rank")]);
    if (or) d.mc_org_r.push(or);
    if (!d.top1 && r[col("top_organic_1")]) d.top1 = r[col("top_organic_1")];
  }

  const pct = (n, t) => parseFloat((n / t * 100).toFixed(2));
  const avg = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : "";

  const output = [headers];
  Object.values(byKw).forEach(d => {
    const t = d.scans;
    output.push([
      d.keyword, d.ngram, t,
      pct(d.aio, t), pct(d.mc_aio, t), avg(d.mc_aio_r),
      pct(d.mc_org, t), avg(d.mc_org_r), pct(d.mc_ads, t),
      pct(d.brevo, t), pct(d.klaviyo, t), pct(d.mailerlite, t),
      pct(d.omnisend, t), pct(d.hubspot, t), pct(d.activecampaign, t),
      pct(d.constantcontact, t), pct(d.ads_above, t), d.top1
    ]);
  });

  out.getRange(1, 1, output.length, headers.length).setValues(output);
}
