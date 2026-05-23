// utils/attendanceCalculator.js
class AttendanceCalculator {
    constructor(companyPolicy = {}) {
        this.policy = {
            workingHoursPerDay: 8,
            workingDaysPerMonth: 28,
            graceMinutes: 15, // Grace period for late coming
            earlyOutGraceMinutes: 15, // Grace period for early leaving
            overtimeMultiplier: 2, // Double rate for overtime
            ...companyPolicy
        };
    }

    /**
     * Calculate attendance summary for an employee for a given month
     */
    calculateMonthlyAttendance(attendanceRecords, employeeDailyWage) {
        const summary = {
            totalWorkingDays: this.policy.workingDaysPerMonth,
            presentDays: 0,
            absentDays: 0,
            lateDays: 0,
            lateDeductedHours: 0,
            earlyOutDays: 0,
            earlyOutDeductedHours: 0,
            totalDaysDeducted: 0,
            lopDays: 0,
            lopAmount: 0,
            overtimeDays: 0,
            overtimeHours: 0,
            overtimeAmount: 0,
            totalWorkingHours: 0,
            expectedWorkingHours: 0
        };

        if (!attendanceRecords || attendanceRecords.length === 0) {
            summary.absentDays = summary.totalWorkingDays;
            summary.lopDays = summary.totalWorkingDays;
            summary.lopAmount = summary.totalWorkingDays * employeeDailyWage;
            return summary;
        }

        let totalLateMinutes = 0;
        let totalEarlyOutMinutes = 0;
        let totalOvertimeMinutes = 0;
        let daysWithAttendance = new Set();

        for (const record of attendanceRecords) {
            if (!record.check_in || !record.check_out) continue;

            const checkInTime = new Date(record.check_in);
            const checkOutTime = new Date(record.check_out);
            const attendanceDate = checkInTime.toDateString();
            
            daysWithAttendance.add(attendanceDate);

            // Calculate expected check-in time (9 AM default)
            const expectedCheckIn = new Date(checkInTime);
            expectedCheckIn.setHours(9, 0, 0, 0);
            
            const expectedCheckOut = new Date(checkOutTime);
            expectedCheckOut.setHours(17, 0, 0, 0);

            // Calculate late minutes
            const lateMinutes = Math.max(0, (checkInTime - expectedCheckIn) / (1000 * 60));
            const effectiveLateMinutes = Math.max(0, lateMinutes - this.policy.graceMinutes);
            
            if (effectiveLateMinutes > 0) {
                summary.lateDays++;
                totalLateMinutes += effectiveLateMinutes;
                summary.lateDeductedHours += effectiveLateMinutes / 60;
            }

            // Calculate early out minutes
            const earlyOutMinutes = Math.max(0, (expectedCheckOut - checkOutTime) / (1000 * 60));
            const effectiveEarlyOutMinutes = Math.max(0, earlyOutMinutes - this.policy.earlyOutGraceMinutes);
            
            if (effectiveEarlyOutMinutes > 0) {
                summary.earlyOutDays++;
                totalEarlyOutMinutes += effectiveEarlyOutMinutes;
                summary.earlyOutDeductedHours += effectiveEarlyOutMinutes / 60;
            }

            // Calculate working hours
            const workingHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);
            summary.totalWorkingHours += workingHours;
            
            // Calculate overtime (beyond 8 hours)
            const overtimeMinutes = Math.max(0, workingHours - this.policy.workingHoursPerDay) * 60;
            if (overtimeMinutes > 0) {
                totalOvertimeMinutes += overtimeMinutes;
            }
        }

        // Calculate total days deducted
        summary.totalDaysDeducted = (totalLateMinutes / (60 * this.policy.workingHoursPerDay)) + 
                                    (totalEarlyOutMinutes / (60 * this.policy.workingHoursPerDay));
        
        // Calculate LOP (Loss of Pay)
        const presentDays = daysWithAttendance.size;
        summary.presentDays = presentDays;
        summary.absentDays = summary.totalWorkingDays - presentDays;
        
        // LOP for absent days + partial days from late/early
        const partialDayDeduction = summary.totalDaysDeducted;
        summary.lopDays = summary.absentDays + partialDayDeduction;
        summary.lopAmount = summary.lopDays * employeeDailyWage;

        // Calculate overtime
        summary.overtimeHours = totalOvertimeMinutes / 60;
        summary.overtimeDays = summary.overtimeHours / this.policy.workingHoursPerDay;
        summary.overtimeAmount = (totalOvertimeMinutes / 60) * employeeDailyWage * this.policy.overtimeMultiplier;

        summary.expectedWorkingHours = summary.totalWorkingDays * this.policy.workingHoursPerDay;

        return summary;
    }

    /**
     * Calculate daily wage from monthly salary
     */
    calculateDailyWage(monthlySalary) {
        return monthlySalary / this.policy.workingDaysPerMonth;
    }
}

module.exports = AttendanceCalculator;