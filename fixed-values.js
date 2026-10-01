// fixed-values.js - the FIXED values for every vehicle. ILLUSTRATIVE / SAMPLE DATA (made up).
// A reading only records the date, the shift, the vehicle and the exception type.
// Fixed litres always come from this list. The actual diesel consumed can be typed in the Add reading form.
//   litres = fixed diesel per shift (Ltrs)
// The fixed litres are the NORM for an 8-hour shift (so the norm rate is litres / 8 Ltrs/hr).
// The real WORKING HOURS of each reading are typed in the Add reading form (they are not fixed).
window.NORM_HOURS = 8;
// To add or change a vehicle: edit this list (keep the same layout), then save and publish.
window.FIXED_VEHICLES = [
  { no: "HD-01", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "HD-02", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "HD-03", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "HD-04", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "HD-05", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "HD-06", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "HD-07", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "HD-08", vtype: "H.E. Dumpers", mine: "Mine A", litres: 360 },
  { no: "TP-01", vtype: "Tippers", mine: "Mine B", litres: 210 },
  { no: "TP-02", vtype: "Tippers", mine: "Mine B", litres: 210 },
  { no: "TP-03", vtype: "Tippers", mine: "Mine B", litres: 210 },
  { no: "TP-04", vtype: "Tippers", mine: "Mine B", litres: 210 },
  { no: "TP-05", vtype: "Tippers", mine: "Mine B", litres: 210 },
  { no: "EX-01", vtype: "Excavators", mine: "Mine C", litres: 320 },
  { no: "EX-02", vtype: "Excavators", mine: "Mine C", litres: 320 },
  { no: "EX-03", vtype: "Excavators", mine: "Mine C", litres: 320 },
  { no: "EX-04", vtype: "Excavators", mine: "Mine C", litres: 320 },
  { no: "DZ-01", vtype: "Dozers", mine: "Mine D", litres: 450 },
  { no: "DZ-02", vtype: "Dozers", mine: "Mine D", litres: 450 },
  { no: "DZ-03", vtype: "Dozers", mine: "Mine D", litres: 450 },
  { no: "GR-01", vtype: "Graders", mine: "Mine E", litres: 175 },
  { no: "GR-02", vtype: "Graders", mine: "Mine E", litres: 175 },
  { no: "OT-01", vtype: "Others", mine: "Mine E", litres: 120 },
  { no: "OT-02", vtype: "Others", mine: "Mine E", litres: 120 }
];
