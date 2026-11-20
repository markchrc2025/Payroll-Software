# BIR 1604-C alphalist .DAT file

PAY-71, ruling 6 (Mark, 20 Nov 2026): the file follows the BIR Alphalist Data Entry and Validation module, version 7.4. This is the format as read from that module's compiled programs, written down so the code can be checked against it without the module. Where BIR's data-entry tool and its validator disagree, the validator decides, because a file must pass it before submission.

## Rules that apply to the whole file

- File name: TIN(9) + BRANCH(4) + "1231" + YEAR + "1604C.DAT". Lines end CR LF. Comma separated.
- Amounts: plain "1234.56" (str(x,20,2)), no thousands separators, zero "0.00", negative "-12.00" allowed (digitchk sw=2 allows leading -).
- Dates: MM/DD/YYYY (length 10, year >= 1950).
- Names: wrapped in double quotes ("SANTOS"); characters " & ' , | and non-ASCII (outside 32..126) are invalid in names. Name not all empty.
- Generator strips " , ' from character fields.

## Lines

H line: H1604C,TIN9,BRANCH4,12/31/YYYY   (7 cols max; cols 8..14 must be empty)

D1 (49 cols; col 49 must not be empty; 50+ empty):
 1 D1 | 2 1604C | 3 WA TIN | 4 WA branch | 5 12/31/YYYY | 6 seq (digits) | 7 payee TIN (9 digits, may be empty; not 999999999/111111111)
 8 payee branch (4 digits if present) | 9 last | 10 first | 11 middle | 12 region (REQUIRED: I II III IV-A IV-B V VI VII VIII IX X XI XII XIII NCR ARMM CAR or 1..13, 4-A, 4-B)
 13 prev gross (= 19 + 23; checked when non-zero) | 14 prev nontax basic/SMW | 15 prev nontax 13th (<= 90000) | 16 prev de minimis | 17 prev SSS etc | 18 prev nontax salaries
 19 prev total nontax (= 14..18) | 20 prev taxable basic | 21 prev taxable 13th | 22 prev taxable salaries | 23 prev total taxable (= 20+21+22)
 24 employment from MM/DD/YYYY | 25 to (from <= to, both required)
 26 present gross (= 32 + 36) | 27 pres nontax basic | 28 pres nontax 13th | 29 pres de minimis | 30 pres SSS etc | 31 pres nontax salaries
 32 pres total nontax (= 27..31) | 33 pres taxable basic | 34 pres taxable 13th | 35 pres taxable salaries | 36 pres total taxable (= 33+34+35)
 37 total taxable prev+pres (= 23 + 36) | 38 net taxable (= 37) | 39 tax due | 40 prev tax withheld | 41 pres tax withheld (Jan to Nov)
 42 withheld in December (if != 0: = 39 - (40+41) - 49) | 43 over-withheld refunded (= 40+41+49-39 when that is >= 0)
 44 tax withheld as adjusted (= 40+41+49-43 or 40+41+49+42) AND 44 MUST EQUAL 39
 45 nationality (not numeric) | 46 employment status (R C CP S P AL) | 47 reason of separation (T TR R D) | 48 substituted filing (Y/N) | 49 PERA tax credit
Formula checks compare int() then round(,2): so must hold to the centavo.

D2 (59 cols; col 59 must not be empty; 60+ empty):
 1..12 as D1 (12 region REQUIRED)
 13 prev gross | 14 prev SMW basic | 15 prev holiday | 16 prev OT | 17 prev NSD | 18 prev hazard | 19 prev 13th (<= 90000) | 20 prev de minimis | 21 prev SSS
 22 prev nontax salaries | 23 prev total nontax | 24 prev taxable 13th | 25 prev taxable salaries | 26 prev total taxable
 27 from | 28 to
 29 pres gross | 30 SMW per day (REQUIRED) | 31 SMW per month | 32 SMW per year | 33 factor used (days/year)
 34 holiday | 35 OT | 36 NSD | 37 hazard | 38 13th | 39 de minimis | 40 SSS etc | 41 nontax salaries | 42 total nontax
 43 taxable 13th | 44 taxable salaries | 45 total taxable present | 46 total taxable prev+pres | 47 net taxable | 48 tax due
 49 prev withheld | 50 pres withheld | 51 December | 52 over-withheld | 53 actual (as adjusted) | 54 nationality | 55 status | 56 reason | 57 subs filing | 58 PERA
 59 nontax basic salary / SMW actual (REQUIRED, "Basic Statutory Min. Wage", added Jan 2024)
 Schedule 2 has character checks only (no cross-column formulas).

C1 (35 cols): C1,1604C,TIN,BRANCH,12/31/YYYY + 30 totals in this order:
 prev gross, prev SMW basic, prev 13th, prev de min, prev SSS, prev salaries, prev total nontax, prev taxable basic, prev taxable 13th, prev taxable salaries, prev total taxable,
 pres gross, pres nontax basic, pres 13th, pres de min, pres SSS, pres salaries, pres total nontax, pres taxable basic, pres taxable 13th, pres taxable salaries, pres total taxable,
 prev+pres taxable, net taxable, tax due, prev withheld, pres withheld, December, over-withheld, actual.
 (BIR's data-entry tool appends a 31st, PERA; its own validator rejects it as an excess column. Follow the validator.)
C2 (43 cols): C2,1604C,TIN,BRANCH,12/31/YYYY + 38 totals:
 prev gross, prev SMW, prev holiday, prev OT, prev NSD, prev hazard, prev 13th, prev de min, prev SSS, prev salaries, prev total nontax, prev taxable 13th, prev taxable salaries, prev total taxable,
 pres gross, SMW day, SMW month, SMW year, holiday, OT, NSD, hazard, 13th, de min, SSS, salaries, total nontax, taxable 13th, taxable salaries, total taxable present,
 prev+pres taxable, net taxable, tax due, prev withheld, pres withheld, December, over-withheld, actual.
 (Data-entry tool appends PERA and nontax basic: 40; validator accepts 38.)
One control record per schedule. Only schedules 1 and 2 are valid for 1604C.
Status combo: Regular R, Casual C, Contractual/Project-Based CP (Seasonal S, Probationary P, Apprentices/Learners AL per form legend).
Reason combo: Terminated/Resigned T, Transferred TR, Retirement R, Death D. Subs filing: Y/N.
