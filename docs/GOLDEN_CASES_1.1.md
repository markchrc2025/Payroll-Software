# Golden cases 1.1: gross to net

PAY-56, launch gate 4. Each case is worked by hand from the 2026 statutory baseline (`src/lib/statutory/baseline-2026.ts`) and checked against the engine by `src/__tests__/pay56-golden-cases.test.ts`. A case that fails means the engine changed what an employee is paid: find out why before touching the expected figures.

Common facts: NCR; hired 8 Jan 2024; 261-day year; statutory cutoff FIRST_CUTOFF unless stated; 2026 rules: SSS (MSC 5,000 to 35,000 in 500 steps; EE 5% of MSC up to 20,000 plus 5% of the excess for MPF), PhilHealth 5% split 50/50 on 10,000 to 100,000, Pag-IBIG EE 2% on up to 10,000, TRAIN withholding table of 2023 onward. Daily rate of a monthly salary = salary x 12 / 261, rounded down to the centavo; hourly = daily / 8, rounded to the centavo; premiums are half-up to the centavo.

| Case | Who and period | Worked by hand | Gross | SSS | PhilHealth | Pag-IBIG | Taxable | Tax | Net |
|---|---|---|---|---|---|---|---|---|---|
| G1 | 30,000.00 a month, paid monthly, Nov 2026 | MSC 30,000: 1,000.00 + 500.00 MPF; 30,000 x 2.5%; taxable 27,550.00; (27,550.00 - 20,833.00) x 15% | 30,000.00 | 1,500.00 | 750.00 | 200.00 | 27,550.00 | 1,007.55 | 26,542.45 |
| G2a | Same, semi-monthly, 1 to 15 Nov | the month's contributions in the first cutoff; (12,550.00 - 10,417.00) x 15% | 15,000.00 | 1,500.00 | 750.00 | 200.00 | 12,550.00 | 319.95 | 12,230.05 |
| G2b | Same, 16 to 30 Nov | no contributions (counted once a month, REP-29); (15,000.00 - 10,417.00) x 15% | 15,000.00 | 0.00 | 0.00 | 0.00 | 15,000.00 | 687.45 | 14,312.55 |
| G3 | 700.00 a day, paid weekly, 2 to 8 Nov, 6 days | 4,200.00; the week has no month end, so no contributions; below 4,808.00 | 4,200.00 | 0.00 | 0.00 | 0.00 | 4,200.00 | 0.00 | 4,200.00 |
| G3b | Same, 30 Nov to 6 Dec, 6 days | the week holds 30 Nov: monthly equivalent 700 x 261 / 12 = 15,225.00, MSC 15,000; 15,225.00 x 2.5% = 380.625 | 4,200.00 | 750.00 | 380.63 | 200.00 | 2,869.37 | 0.00 | 2,869.37 |
| G4 | Minimum wage earner, 645.00 a day, semi-monthly, 1 to 15 Nov, 13 days | 8,385.00, all exempt; monthly equivalent 14,028.75, MSC 14,000; 14,028.75 x 2.5% = 350.72 | 8,385.00 | 700.00 | 350.72 | 200.00 | 0.00 | 0.00 | 7,134.28 |
| G5 | 30,000.00 a month, semi-monthly, 1 to 15 Nov; late 60 minutes, overtime 2 hours, night differential 3 hours | daily 1,379.31, hourly 172.41; late 172.41; OT 172.41 x 1.25 x 2 = 431.03; NSD 172.41 x 0.10 x 3 = 51.72; (12,860.34 - 10,417.00) x 15% = 366.50 | 15,310.34 | 1,500.00 | 750.00 | 200.00 | 12,860.34 | 366.50 | 12,493.84 |
| G6 | 1,200.00 a week, paid weekly, 2 to 8 Nov | contracted weekly salary; no month end in the week | 1,200.00 | 0.00 | 0.00 | 0.00 | 1,200.00 | 0.00 | 1,200.00 |
| G7 | 150,000.00 a month, paid monthly, Nov | MSC 35,000: 1,000.00 + 750.00; PhilHealth at the 100,000 ceiling; 8,541.70 + (145,550.00 - 66,667.00) x 25% | 150,000.00 | 1,750.00 | 2,500.00 | 200.00 | 145,550.00 | 28,262.45 | 117,287.55 |
| G8 | 13th month of 30,000.00 (Year-End run) | within the 90,000.00 exemption; no contributions | 30,000.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 30,000.00 |
| G10 | Minimum wage earner, 645.00 a day, 13 days, overtime 2 hours | hourly 80.63; OT 80.63 x 1.25 x 2 = 201.58, exempt with the basic | 8,586.58 | 700.00 | 350.72 | 200.00 | 0.00 | 0.00 | 7,335.86 |
| G11 | 30,000.00 a month, semi-monthly, 16 to 30 Nov, SECOND_CUTOFF | the month's contributions in the second cutoff | 15,000.00 | 1,500.00 | 750.00 | 200.00 | 12,550.00 | 319.95 | 12,230.05 |
| G12 | 30,000.00 a month, semi-monthly, 1 to 15 Nov, 1 unpaid day | unpaid day 30,000 x 12 / 261 = 1,379.31 (half-up); contributions on the contracted salary; (11,170.69 - 10,417.00) x 15% = 113.05 | 13,620.69 | 1,500.00 | 750.00 | 200.00 | 11,170.69 | 113.05 | 11,057.64 |
| G13 | G1 with a 2,500.00 rice subsidy | 2,000.00 de minimis; the 500.00 excess falls in the 90,000.00 exemption for 13th month and other benefits, so taxable pay is unchanged | 32,500.00 | 1,500.00 | 750.00 | 200.00 | 27,550.00 | 1,007.55 | 29,042.45 |
| G14 | 800.00 a day, semi-monthly, 1 to 15 Nov, 11 days | 8,800.00; monthly equivalent 17,400.00, MSC 17,500; 17,400.00 x 2.5% | 8,800.00 | 875.00 | 435.00 | 200.00 | 7,290.00 | 0.00 | 7,290.00 |
| G15 | 800.00 a day, semi-monthly, 1 to 15 Nov, 10 days plus 8 hours worked on a regular holiday | 8,000.00 + 100.00 x 2.00 x 8 = 1,600.00 (200% for the holiday worked) | 9,600.00 | 875.00 | 435.00 | 200.00 | 8,090.00 | 0.00 | 8,090.00 |

Taxable here is the engine's grossTaxableIncome: taxable pay after the employee's contributions.

## Left out until ruled

- A monthly-paid employee who works a regular holiday. The engine adds 200% of the hourly rate on top of the contracted monthly salary (which already pays the holiday), 300% in all. The Labor Code's 200% for work on a regular holiday reads as 200% in all for a monthly-paid employee, so 100% on top. Raised to Mark; the case goes in once he rules.
