'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Terminal,
  Users,
  UserCheck,
  UserX,
  Search,
  ArrowLeft,
  RotateCw,
  Sun,
  Moon,
  ShieldCheck,
  CheckCircle,
  XCircle,
  SlidersHorizontal,
} from 'lucide-react';

interface EmployeeItem {
  employeeId: string;
  employeeName: string;
  is_active: boolean;
}

export default function OnboardPage() {
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [theme, setTheme] = useState<'DARK' | 'LIGHT'>('DARK');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/employees');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEmployees(data.employees || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleStatus = async (employeeId: string, currentStatus: boolean, employeeName: string) => {
    const newStatus = !currentStatus;
    setUpdatingId(employeeId);

    // Optimistic UI update
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.employeeId === employeeId ? { ...emp, is_active: newStatus } : emp
      )
    );

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          employeeName,
          is_active: newStatus,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(
          `User ${employeeName} (${employeeId}) set to [${newStatus ? 'ACTIVE' : 'INACTIVE'}]`
        );
      } else {
        // Revert on error
        setEmployees((prev) =>
          prev.map((emp) =>
            emp.employeeId === employeeId ? { ...emp, is_active: currentStatus } : emp
          )
        );
        showToast(`ERROR: ${data.error || 'Failed to update status'}`);
      }
    } catch (err: any) {
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.employeeId === employeeId ? { ...emp, is_active: currentStatus } : emp
        )
      );
      showToast(`ERROR: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const isLight = theme === 'LIGHT';

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeName.toLowerCase().includes(search.toLowerCase());

    if (statusFilter === 'ACTIVE') return matchesSearch && emp.is_active;
    if (statusFilter === 'INACTIVE') return matchesSearch && !emp.is_active;
    return matchesSearch;
  });

  const totalCount = employees.length;
  const activeCount = employees.filter((e) => e.is_active).length;
  const inactiveCount = employees.filter((e) => !e.is_active).length;

  return (
    <div className={`min-h-screen p-2 sm:p-4 md:p-6 font-mono transition-colors duration-300 selection:bg-emerald-500 selection:text-black ${
      isLight ? 'bg-white text-slate-900' : 'bg-[#05080f] text-sky-400'
    }`}>
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div className="fixed top-4 right-4 z-50 p-3 rounded-lg border-2 shadow-2xl font-mono text-xs animate-bounce bg-emerald-950 text-emerald-300 border-emerald-500 shadow-emerald-950/80 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header Terminal Box */}
        <div className={`terminal-window rounded-lg border-2 overflow-hidden transition-colors duration-300 ${
          isLight ? 'bg-white border-2 border-black shadow-xl' : 'bg-[#090d16]/95 border-slate-700/80 shadow-2xl'
        }`}>
          {/* Header Bar */}
          <div className={`px-3 sm:px-4 py-2.5 border-b-2 flex items-center justify-between transition-colors ${
            isLight ? 'bg-white border-b-2 border-black text-slate-900' : 'bg-[#0f172a] border-slate-700 text-slate-300'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/90 inline-block shadow-sm"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-500/90 inline-block shadow-sm"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/90 inline-block shadow-sm"></span>
              <span className="ml-2 text-xs font-bold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                root@tfc-biometric-monitor: /srv/www/onboard_employees (bash)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className={`flex items-center gap-1.5 px-3 py-1 rounded border-2 text-xs font-bold transition-all active:scale-95 ${
                  isLight
                    ? 'bg-emerald-50 border-black text-emerald-900 hover:bg-emerald-100'
                    : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/60'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>RETURN TO DASHBOARD</span>
              </Link>

              {/* Theme Toggle */}
              <div 
                className="flex items-center gap-1.5 cursor-pointer select-none" 
                onClick={() => setTheme(isLight ? 'DARK' : 'LIGHT')}
              >
                <span className="text-[10px] font-bold">{isLight ? 'LIGHT' : 'DARK'}</span>
                <div className={`relative inline-flex h-5 w-9 rounded-full border-2 ${isLight ? 'bg-amber-100 border-black' : 'bg-slate-900 border-slate-700'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full transition ${isLight ? 'translate-x-4 bg-white border border-black' : 'translate-x-0 bg-slate-950'}`}></span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            
            {/* Title Banner */}
            <div className={`p-4 border-2 rounded flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isLight ? 'bg-white border-black text-slate-900' : 'bg-[#060a12] border-slate-800 text-sky-200'
            }`}>
              <div>
                <h1 className="text-lg font-bold flex items-center gap-2 text-emerald-500">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  EMPLOYEE ONBOARDING & ACTIVE USER MANAGEMENT
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Manage active employee access. Inactive employees will be automatically hidden from the main dashboard & raw logs.
                </p>
              </div>

              <button
                onClick={fetchEmployees}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border-2 text-xs font-bold transition-all active:scale-95 ${
                  isLight ? 'bg-white border-black hover:bg-slate-100' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                }`}
              >
                <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
                <span>REFRESH LIST</span>
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`p-3 border-2 rounded ${isLight ? 'bg-white border-black' : 'bg-[#0c1220] border-slate-700/90'}`}>
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-sky-400" /> TOTAL REGISTERED EMPLOYEES
                </div>
                <div className="text-2xl font-bold mt-1 text-sky-400">{totalCount}</div>
              </div>

              <div className={`p-3 border-2 rounded ${isLight ? 'bg-white border-black' : 'bg-[#0c1220] border-slate-700/90'}`}>
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> ACTIVE EMPLOYEES
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-400">{activeCount}</div>
              </div>

              <div className={`p-3 border-2 rounded ${isLight ? 'bg-white border-black' : 'bg-[#0c1220] border-slate-700/90'}`}>
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <UserX className="w-3.5 h-3.5 text-red-400" /> INACTIVE EMPLOYEES
                </div>
                <div className="text-2xl font-bold mt-1 text-red-400">{inactiveCount}</div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className={`border-2 p-3 rounded flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 ${
              isLight ? 'bg-white border-black' : 'bg-[#0c121e] border-slate-700/90'
            }`}>
              <div className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded border-2 ${
                isLight ? 'bg-white border-black' : 'bg-slate-950 border-slate-700'
              }`}>
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Employee Name or ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none text-xs focus:outline-none font-mono font-bold"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
                {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setStatusFilter(mode)}
                    className={`px-3 py-1 rounded border-2 text-xs font-bold transition-all ${
                      statusFilter === mode
                        ? isLight
                          ? 'bg-emerald-600 text-white border-black'
                          : 'bg-emerald-500 text-black border-emerald-400'
                        : isLight
                        ? 'bg-white text-slate-900 border-black hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    [{mode}]
                  </button>
                ))}
              </div>
            </div>

            {/* Employee Table */}
            <div className={`border-2 rounded overflow-hidden ${
              isLight ? 'bg-white border-black' : 'bg-[#070b14] border-slate-700/90'
            }`}>
              <div className="overflow-x-auto touch-pan-x scrollbar-thin">
                <table className="w-full text-left text-xs font-mono border-collapse whitespace-nowrap">
                  <thead className={`border-b-2 select-none ${
                    isLight ? 'bg-white text-slate-900 border-black font-bold' : 'bg-[#090e1a] text-slate-300 border-slate-700'
                  }`}>
                    <tr>
                      <th className="py-2.5 px-3 border-r-2 font-bold text-amber-500">#</th>
                      <th className="py-2.5 px-3 border-r-2 font-bold">EMPLOYEE_ID</th>
                      <th className="py-2.5 px-3 border-r-2 font-bold">EMPLOYEE_NAME</th>
                      <th className="py-2.5 px-3 border-r-2 font-bold">CURRENT_STATUS</th>
                      <th className="py-2.5 px-3 font-bold text-center">ACTION_TOGGLE</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y border-t ${
                    isLight ? 'border-black divide-black' : 'border-slate-700/80 divide-slate-800'
                  }`}>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <RotateCw className="w-4 h-4 animate-spin text-emerald-500" />
                            <span>EXEC: loading employees from Supabase Cloud...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          [NO EMPLOYEES FOUND MATCHING SEARCH/FILTER]
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp, idx) => (
                        <tr
                          key={emp.employeeId}
                          className={`border-b transition-colors ${
                            isLight
                              ? 'bg-white hover:bg-slate-100 border-black'
                              : 'hover:bg-sky-950/40 border-slate-800/80'
                          }`}
                        >
                          <td className="py-2.5 px-3 border-r font-bold text-amber-400">#{idx + 1}</td>
                          <td className="py-2.5 px-3 border-r font-bold">
                            <span className="px-2 py-0.5 rounded border text-emerald-400 bg-emerald-950/80 border-emerald-800/80">
                              {emp.employeeId}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 border-r font-bold text-white">{emp.employeeName}</td>
                          <td className="py-2.5 px-3 border-r">
                            {emp.is_active ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border bg-emerald-950/90 text-emerald-400 border-emerald-700/80">
                                <CheckCircle className="w-3 h-3 text-emerald-400" /> ACTIVE
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border bg-red-950/90 text-red-400 border-red-800/80">
                                <XCircle className="w-3 h-3 text-red-400" /> INACTIVE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleToggleStatus(emp.employeeId, emp.is_active, emp.employeeName)}
                              disabled={updatingId === emp.employeeId}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors focus:outline-none ${
                                emp.is_active
                                  ? 'bg-emerald-500 border-emerald-400 shadow-md shadow-emerald-500/30'
                                  : 'bg-slate-900 border-slate-700'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                                  emp.is_active ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
