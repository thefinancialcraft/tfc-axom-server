const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const crypto = require('crypto');

const SUPABASE_URL = 'https://qfbeskgvxjwqccaraulv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmYmVza2d2eGp3cWNjYXJhdWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjQwMTQsImV4cCI6MjA5NzIwMDAxNH0.IPCGYN-v7UkRDygrvcGyZC-3uxjFoiSy7lTUoVe_l9M';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function simulateUi() {
  console.log('=== SIMULATING FRONTEND PAGE.TSX MATCHING LOGIC ===');
  
  // 1. Fetch employees
  const { data: dbEmps } = await supabase.from('employees').select('*');
  const inactiveEmpIds = new Set();
  const activeEmployeesList = [];
  dbEmps.forEach((emp) => {
    if (emp.is_active === false) {
      inactiveEmpIds.add(emp.employeeId);
    } else {
      activeEmployeesList.push({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName || emp.employeeId,
      });
    }
  });

  console.log(`Active Employees: ${activeEmployeesList.length}, Inactive: ${inactiveEmpIds.size}`);

  // 2. Sample records from machine
  const allRecords = [
    { entry_id: 'T2026082212510802662559', atn_token: '260822026', employee_id: 'TFC-026', user_name: 'Sayyad Abdul', attendance_date: '22/08/2026', attendance_time: '12:51:08 PM', serial_no: 62559 },
    { entry_id: 'T2026082212510402662557', atn_token: '260822026', employee_id: 'TFC-026', user_name: 'Sayyad Abdul', attendance_date: '22/08/2026', attendance_time: '12:51:04 PM', serial_no: 62557 },
    { entry_id: 'T2026082212505902662554', atn_token: '260822026', employee_id: 'TFC-026', user_name: 'Sayyad Abdul', attendance_date: '22/08/2026', attendance_time: '12:50:59 PM', serial_no: 62554 },
    { entry_id: 'T2026082211480000362549', atn_token: '260822003', employee_id: 'TFC-003', user_name: 'Manoj Kohli', attendance_date: '22/08/2026', attendance_time: '11:48:00 AM', serial_no: 62549 },
  ];

  const startDate = '2026-08-22';
  const endDate = null;
  const search = '';

  const normalizeDateToIso = (dateStr) => {
    if (!dateStr) return '';
    const clean = dateStr.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        let [d, m, y] = parts;
        if (y.length === 2) y = `20${y}`;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return clean;
  };

  const isRecordMatchingRange = (recordDateStr, startIso, endIso) => {
    if (!recordDateStr) return false;
    const recIso = normalizeDateToIso(recordDateStr);
    if (!endIso || startIso === endIso) {
      return recIso === startIso;
    }
    const minIso = startIso < endIso ? startIso : endIso;
    const maxIso = startIso > endIso ? startIso : endIso;
    return recIso >= minIso && recIso <= maxIso;
  };

  const matchesEmpId = (idA, idB) => {
    if (!idA || !idB) return false;
    if (idA.trim().toLowerCase() === idB.trim().toLowerCase()) return true;
    const numA = idA.replace(/[^0-9]/g, '');
    const numB = idB.replace(/[^0-9]/g, '');
    return numA !== '' && numA === numB;
  };

  const activeSourceRecords = allRecords.filter(
    (r) =>
      isRecordMatchingRange(r.attendance_date, startDate, endDate) &&
      !inactiveEmpIds.has(r.employee_id)
  );

  console.log('activeSourceRecords length:', activeSourceRecords.length);

  const matchedPunchEntryIds = new Set();
  const grouped = [];

  activeEmployeesList.forEach((emp) => {
    const list = activeSourceRecords.filter((item) => matchesEmpId(item.employee_id, emp.employeeId));
    if (list.length > 0) {
      list.forEach(r => matchedPunchEntryIds.add(r.entry_id));
      grouped.push({
        employee_id: emp.employeeId,
        user_name: emp.employeeName,
        check_in_time: list[0].attendance_time,
        check_out_time: list.length > 1 ? list[list.length - 1].attendance_time : '--',
        total_punches: list.length,
        has_punched: true,
      });
    }
  });

  console.log('\nPunched Employees Grouped (has_punched = true):');
  grouped.forEach(g => {
    console.log(`  [PUNCHED] ${g.employee_id} - ${g.user_name} | In: ${g.check_in_time} | Out: ${g.check_out_time} | Total: ${g.total_punches}`);
  });
}

simulateUi();
