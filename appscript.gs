function doPost(e) {

try {
const sheet =
  SpreadsheetApp
    .openById("16Udm3J8-fAnjNs-3Bcq9hMBn6KhMlPELVlHNb9tpvYk")
    .getSheetByName("hik_data");

if (!e || !e.postData || !e.postData.contents) {

  return ContentService
    .createTextOutput(
      JSON.stringify({
        success: false,
        error: "No POST Data Received"
      })
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

const rawData = e.postData.contents;

const data = JSON.parse(rawData);

const rows = [];

data.forEach(r => {

  rows.push([
    r.entry_id || "",
    r.atn_token || "",
    r.employee_id || "",
    r.user_name || "",
    r.attendance_date || "",
    r.attendance_time || ""
  ]);

});

if (rows.length) {

  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      6
    )
    .setValues(rows);
}

return ContentService
  .createTextOutput(
    JSON.stringify({
      success: true,
      inserted: rows.length,
      received: data
    })
  )
  .setMimeType(
    ContentService.MimeType.JSON
  );

} catch (err) {

return ContentService
  .createTextOutput(
    JSON.stringify({
      success: false,
      error: String(err),
      stack: err.stack
    })
  )
  .setMimeType(
    ContentService.MimeType.JSON
  );

}
}
