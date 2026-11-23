/**
 * BidDesk demonstration workspace seed.
 * All records below are fictional sample data, created so the interactive
 * demonstration can run end to end. Every record is labeled "Sample" in the UI
 * via the persistent demonstration banner.
 *
 * Run with: bunx tsx prisma/seed.ts   (or) bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const db = new PrismaClient()

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

// Relative day helper anchored to "now" so the demo always feels live.
const day = (offset: number, hour = 12) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(hour, 0, 0, 0)
  return d
}

const J = (v: unknown) => JSON.stringify(v)
const cents = (dollars: number) => Math.round(dollars * 100)

async function main() {
  // Wipe in FK-safe order
  await db.auditLog.deleteMany()
  await db.notification.deleteMany()
  await db.task.deleteMany()
  await db.aiGeneration.deleteMany()
  await db.reviewFinding.deleteMany()
  await db.reviewCycle.deleteMany()
  await db.requirement.deleteMany()
  await db.proposalSection.deleteMany()
  await db.proposal.deleteMany()
  await db.pricingLine.deleteMany()
  await db.clin.deleteMany()
  await db.pricingModel.deleteMany()
  await db.laborCategory.deleteMany()
  await db.rateSet.deleteMany()
  await db.invoiceLog.deleteMany()
  await db.subcontractor.deleteMany()
  await db.cparsEvaluation.deleteMany()
  await db.optionPeriod.deleteMany()
  await db.modification.deleteMany()
  await db.deliverable.deleteMany()
  await db.contract.deleteMany()
  await db.teamingAgreement.deleteMany()
  await db.pwinFactor.deleteMany()
  await db.pursuit.deleteMany()
  await db.opportunity.deleteMany()
  await db.savedSearch.deleteMany()
  await db.pastPerformance.deleteMany()
  await db.resume.deleteMany()
  await db.libraryItem.deleteMany()
  await db.integration.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()
  await db.organization.deleteMany()

  // -----------------------------------------------------------------------
  // Organization + users
  // -----------------------------------------------------------------------
  const org = await db.organization.create({
    data: {
      name: 'Harbor Point Technologies',
      legalName: 'Harbor Point Technologies LLC',
      uei: 'HP4T8KQ2NVD7',
      cage: '8KQ2N',
      samExpiry: day(214),
      primaryNaics: '541512',
      naicsListJson: J(['541512', '541511', '518210', '541611']),
      sizeStandard: 'Small Business (NAICS 541512, $34M size standard)',
      certificationsJson: J([{ name: 'Small Business' }]),
      vehiclesJson: J([{ name: 'GSA MAS', number: 'GS-35F-0456X' }]),
      facilityClearance: 'None',
      dcaaStatus: 'Accounting system reviewed (pre-award survey, 2024)',
      sprsScore: 92,
      sprsDate: day(-46),
      targetAgency: 'Department of Veterans Affairs',
      pwinWeightsJson: J([
        { key: 'customer_relationship', label: 'Customer relationship', weight: 20 },
        { key: 'solution_fit', label: 'Solution fit', weight: 25 },
        { key: 'incumbent_position', label: 'Incumbent position', weight: 15 },
        { key: 'price_competitiveness', label: 'Price competitiveness', weight: 15 },
        { key: 'past_performance', label: 'Past performance relevance', weight: 15 },
        { key: 'teaming_strength', label: 'Teaming strength', weight: 10 },
      ]),
      gateCriteriaJson: J([
        { key: 'strategic_fit', label: 'Strategic fit with growth plan', weight: 20 },
        { key: 'customer_knowledge', label: 'Customer and requirement knowledge', weight: 20 },
        { key: 'competitive_position', label: 'Competitive position', weight: 20 },
        { key: 'resources', label: 'Resource availability', weight: 15 },
        { key: 'past_performance', label: 'Relevant past performance', weight: 15 },
        { key: 'risk', label: 'Contract and delivery risk', weight: 10 },
      ]),
      firstRunDone: false,
      walkthroughSeen: false,
    },
  })

  const users = await Promise.all([
    db.user.create({
      data: { orgId: org.id, email: 'dana.whitfield@harborpointtech.com', name: 'Dana Whitfield', role: 'Owner', title: 'President', initials: 'DW', mfaEnabled: true, passwordHash: hash('BidDesk2025!') },
    }),
    db.user.create({
      data: { orgId: org.id, email: 'marcus.lee@harborpointtech.com', name: 'Marcus Lee', role: 'Capture Manager', title: 'Director of Capture', initials: 'ML', passwordHash: hash('BidDesk2025!') },
    }),
    db.user.create({
      data: { orgId: org.id, email: 'priya.nair@harborpointtech.com', name: 'Priya Nair', role: 'Proposal Manager', title: 'Proposal Center Lead', initials: 'PN', passwordHash: hash('BidDesk2025!') },
    }),
    db.user.create({
      data: { orgId: org.id, email: 'elena.ruiz@harborpointtech.com', name: 'Elena Ruiz', role: 'Contracts Manager', title: 'Manager, Contracts', initials: 'ER', passwordHash: hash('BidDesk2025!') },
    }),
    db.user.create({
      data: { orgId: org.id, email: 'sam.ortiz@harborpointtech.com', name: 'Sam Ortiz', role: 'Pricing Analyst', title: 'Senior Pricing Analyst', initials: 'SO', passwordHash: hash('BidDesk2025!') },
    }),
    db.user.create({
      data: { orgId: org.id, email: 'tom.becker@harborpointtech.com', name: 'Tom Becker', role: 'Contributor', title: 'Chief Architect', initials: 'TB', passwordHash: hash('BidDesk2025!') },
    }),
  ])
  const [owner, capture, propMgr, contracts, pricing, sme] = users

  // -----------------------------------------------------------------------
  // Opportunities (12 fictional notices)
  // -----------------------------------------------------------------------
  const mkOpp = (o: Partial<{
    noticeType: string; title: string; solicitationNumber: string; agency: string; subTier: string; office: string;
    postedOffset: number; deadlineOffset: number | null; naics: string; psc: string; setAside: string;
    popCity: string; popState: string; description: string; valueLabel: string; valueDollars: number | null;
    matchScore: number; factors: unknown[]; status: string; dismissedReason: string; source: string;
  }>) => db.opportunity.create({
    data: {
      orgId: org.id,
      source: o.source ?? 'sam_gov',
      noticeType: o.noticeType!,
      title: o.title!,
      solicitationNumber: o.solicitationNumber!,
      agency: o.agency!,
      subTier: o.subTier!,
      office: o.office!,
      postedDate: day(o.postedOffset ?? -7),
      responseDeadline: o.deadlineOffset === null || o.deadlineOffset === undefined ? null : day(o.deadlineOffset, 17),
      naics: o.naics!,
      psc: o.psc!,
      setAside: o.setAside!,
      popCity: o.popCity!,
      popState: o.popState!,
      description: o.description!,
      estimatedValueCents: o.valueDollars ? cents(o.valueDollars) : null,
      valueLabel: o.valueLabel ?? '',
      link: 'https://sam.gov/opp/' + o.solicitationNumber,
      matchScore: o.matchScore ?? 0,
      matchFactorsJson: J(o.factors ?? []),
      status: o.status ?? 'new',
      dismissedReason: o.dismissedReason ?? '',
    },
  })

  const f = (label: string, score: number, weight: number, detail: string, key = '') =>
    ({ key: key || label.toLowerCase().replace(/[^a-z]+/g, '_'), label, score, weight, detail })

  const o1 = await mkOpp({
    noticeType: 'solicitation', title: 'Digital Health Platform Modernization and Agile Delivery Support',
    solicitationNumber: '36C25X25Q0187', agency: 'Department of Veterans Affairs', subTier: 'Veterans Health Administration',
    office: 'VHA Office of Digital Health', postedOffset: -12, deadlineOffset: 18, naics: '541512', psc: 'D399',
    setAside: 'Small Business', popCity: 'Washington', popState: 'DC',
    description: 'VHA requires modernization of the veteran-facing digital health platform, including re-architecture of legacy portals, agile delivery of new capabilities, DevSecOps pipeline implementation, and 508-compliant user experience design. Base period of one year with three one-year options. Proposal due in two volumes (Technical, Price).',
    valueLabel: '$8.6M', valueDollars: 8600000, matchScore: 87,
    factors: [
      f('NAICS match', 100, 25, '541512 is your primary NAICS.'),
      f('Set-aside eligibility', 100, 15, 'Small Business set-aside; your SAM profile qualifies.'),
      f('Past performance relevance', 85, 25, 'Two approved past performances match digital health platform work.'),
      f('Contract vehicle fit', 70, 15, 'Not on required vehicle; teaming or open competition applies.'),
      f('Geography', 90, 10, 'Performance of work within your registered states.'),
      f('Keyword relevance', 80, 10, 'Agile delivery, DevSecOps, 508 compliance — strong library matches.'),
    ],
  })

  const o2 = await mkOpp({
    noticeType: 'solicitation', title: 'Cloud Migration and Platform Engineering Services (CISA)',
    solicitationNumber: '70Z03825Q0000421', agency: 'Department of Homeland Security', subTier: 'Cybersecurity and Infrastructure Security Agency',
    office: 'CISA Cloud Services Division', postedOffset: -6, deadlineOffset: 24, naics: '518210', psc: '7320',
    setAside: 'SDVOSB', popCity: 'Arlington', popState: 'VA',
    description: 'CISA seeks cloud platform engineering support including landing zone design, migration factory operations, container platform administration, and continuous ATO engineering under an agile delivery model.',
    valueLabel: '$4.2M', valueDollars: 4200000, matchScore: 61,
    factors: [
      f('NAICS match', 60, 25, '518210 is in your registered NAICS list.'),
      f('Set-aside eligibility', 10, 15, 'SDVOSB set-aside; your SAM profile does not hold this certification.'),
      f('Past performance relevance', 55, 25, 'Cloud migration work is adjacent to your portfolio.'),
      f('Contract vehicle fit', 80, 15, 'GSA MAS order; you hold an active MAS schedule.'),
      f('Geography', 100, 10, 'Arlington, VA — within your primary geography.'),
      f('Keyword relevance', 75, 10, 'Platform engineering and continuous ATO match library content.'),
    ],
  })

  const o3 = await mkOpp({
    noticeType: 'presolicitation', title: 'Enterprise Data Lakehouse and Analytics Environment',
    solicitationNumber: 'W912DZ25B0009', agency: 'Department of Defense', subTier: 'U.S. Army Corps of Engineers',
    office: 'Engineer Research and Development Center', postedOffset: -3, deadlineOffset: 41, naics: '541512', psc: 'D317',
    setAside: 'Small Business', popCity: 'Vicksburg', popState: 'MS',
    description: 'ERDC intends to solicit a data lakehouse platform build-out, streaming data ingestion, geospatial analytics services, and data governance implementation. Presolicitation notice; questions due in 10 days, RFP expected next month.',
    valueLabel: '', valueDollars: null, matchScore: 78,
    factors: [
      f('NAICS match', 100, 25, '541512 is your primary NAICS.'),
      f('Set-aside eligibility', 100, 15, 'Small Business set-aside; your SAM profile qualifies.'),
      f('Past performance relevance', 90, 25, 'Geospatial Data Platform contract for ERDC is directly relevant.'),
      f('Contract vehicle fit', 60, 15, 'Open competition; no vehicle dependency.'),
      f('Geography', 70, 10, 'Vicksburg, MS — outside your primary states; travel required.'),
      f('Keyword relevance', 70, 10, 'Lakehouse and data governance match your data engineering library.'),
    ],
  })

  const o4 = await mkOpp({
    noticeType: 'sources_sought', title: 'Agile Development Services for Grants Management Modernization',
    solicitationNumber: '47QRAA25SS0031', agency: 'General Services Administration', subTier: 'Federal Acquisition Service',
    office: 'GSA Grants Service Line', postedOffset: -2, deadlineOffset: 12, naics: '541512', psc: 'R425',
    setAside: 'None', popCity: 'Washington', popState: 'DC',
    description: 'GSA is conducting market research on agile development capabilities for grants management system modernization, including human-centered design, low-code platform delivery, and data standards alignment (DATA Act). Responses to this sources sought will shape the acquisition strategy.',
    valueLabel: '', valueDollars: null, matchScore: 72,
    factors: [
      f('NAICS match', 100, 25, '541512 is your primary NAICS.'),
      f('Set-aside eligibility', 50, 15, 'Full and open; small business status is a differentiator, not a gate.'),
      f('Past performance relevance', 65, 25, 'Grants modernization is adjacent; one past performance overlaps.'),
      f('Contract vehicle fit', 95, 15, 'GSA MAS order; you hold an active MAS schedule.'),
      f('Geography', 90, 10, 'Washington, DC — within your primary geography.'),
      f('Keyword relevance', 55, 10, 'Agile development matches strongly; grants domain is newer to you.'),
    ],
  })

  const o5 = await mkOpp({
    noticeType: 'solicitation', title: 'Clinical Research Data Management Systems Support (NIH)',
    solicitationNumber: '75N98025Q00115', agency: 'Department of Health and Human Services', subTier: 'National Institutes of Health',
    office: 'NIH Clinical Center', postedOffset: -8, deadlineOffset: 9, naics: '541511', psc: 'D399',
    setAside: 'WOSB', popCity: 'Bethesda', popState: 'MD',
    description: 'Support for clinical research data management systems including REDCap administration, data standards implementation (CDISC), ETL development, and regulatory reporting. One base year plus two option years.',
    valueLabel: '$2.9M', valueDollars: 2900000, matchScore: 48,
    factors: [
      f('NAICS match', 70, 25, '541511 is in your registered NAICS list.'),
      f('Set-aside eligibility', 10, 15, 'WOSB set-aside; your SAM profile does not hold this certification.'),
      f('Past performance relevance', 40, 25, 'Clinical research domain is outside current past performance.'),
      f('Contract vehicle fit', 70, 15, 'Open to GSA MAS holders.'),
      f('Geography', 90, 10, 'Bethesda, MD — within your primary geography.'),
      f('Keyword relevance', 50, 10, 'Data engineering matches; CDISC is a gap.'),
    ],
  })

  const o6 = await mkOpp({
    noticeType: 'combined_synopsis', title: 'Cybersecurity Compliance and RMF Support Services',
    solicitationNumber: 'FA252125Q0034', agency: 'Department of the Air Force', subTier: 'Air Force Installation Contracting Center',
    office: 'Patrick SFB Contracting', postedOffset: -4, deadlineOffset: 15, naics: '541512', psc: '7320',
    setAside: 'None', popCity: 'Patrick SFB', popState: 'FL',
    description: 'Risk Management Framework (RMF) implementation, eMASS support, continuous monitoring, and security control assessment support for space launch range systems. Facility clearance required.',
    valueLabel: '$3.7M', valueDollars: 3700000, matchScore: 39,
    factors: [
      f('NAICS match', 100, 25, '541512 is your primary NAICS.'),
      f('Set-aside eligibility', 50, 15, 'Full and open competition.'),
      f('Past performance relevance', 25, 25, 'RMF work is limited in your past performance.'),
      f('Contract vehicle fit', 60, 15, 'Open competition.'),
      f('Geography', 40, 10, 'Patrick SFB, FL — outside primary geography.'),
      f('Keyword relevance', 35, 10, 'eMASS and range systems are gaps; facility clearance missing.'),
    ],
  })

  const o7 = await mkOpp({
    noticeType: 'sources_sought', title: 'Modernization of Taxpayer-Facing Web Applications',
    solicitationNumber: 'TIRNO-25-SS-00014', agency: 'Department of the Treasury', subTier: 'Internal Revenue Service',
    office: 'IRS Online Services', postedOffset: -1, deadlineOffset: 20, naics: '541512', psc: 'D399',
    setAside: 'Small Business', popCity: 'Washington', popState: 'DC',
    description: 'Market research for modernization of taxpayer-facing web applications: content management migration, design system adoption, accessibility remediation, and cloud hosting optimization.',
    valueLabel: '', valueDollars: null, matchScore: 69,
    factors: [
      f('NAICS match', 100, 25, '541512 is your primary NAICS.'),
      f('Set-aside eligibility', 100, 15, 'Small Business; your SAM profile qualifies.'),
      f('Past performance relevance', 70, 25, 'Web modernization past performance is directly relevant.'),
      f('Contract vehicle fit', 80, 15, 'GSA MAS order expected.'),
      f('Geography', 90, 10, 'Washington, DC — within your primary geography.'),
      f('Keyword relevance', 60, 10, 'CMS migration and 508 remediation match library items.'),
    ],
  })

  const o8 = await mkOpp({
    noticeType: 'solicitation', title: 'Enterprise GIS Platform Sustainment and Enhancement',
    solicitationNumber: 'N6247325Q3321', agency: 'Department of the Navy', subTier: 'Naval Facilities Engineering Systems Command',
    office: 'NAVFAC Atlantic', postedOffset: -10, deadlineOffset: 7, naics: '541690', psc: 'R402',
    setAside: 'Small Business', popCity: 'Norfolk', popState: 'VA',
    description: 'Sustainment and enhancement of the enterprise GIS platform: ArcGIS administration, data pipeline maintenance, mobile field data collection support, and integration with facility asset management systems.',
    valueLabel: '$1.4M', valueDollars: 1400000, matchScore: 56,
    factors: [
      f('NAICS match', 40, 25, '541690 is not in your registered NAICS list.'),
      f('Set-aside eligibility', 100, 15, 'Small Business; your SAM profile qualifies.'),
      f('Past performance relevance', 80, 25, 'Geospatial platform work for USACE is directly relevant.'),
      f('Contract vehicle fit', 55, 15, 'Open competition.'),
      f('Geography', 80, 10, 'Norfolk, VA — adjacent to your primary geography.'),
      f('Keyword relevance', 65, 10, 'GIS administration and data pipelines partially match.'),
    ],
  })

  const o9 = await mkOpp({
    noticeType: 'special_notice', title: 'Industry Day: Artificial Intelligence Adoption Strategy',
    solicitationNumber: '129Q925N0012', agency: 'Department of Commerce', subTier: 'National Institute of Standards and Technology',
    office: 'NIST Advanced Communications', postedOffset: -1, deadlineOffset: 27, naics: '541611', psc: 'R408',
    setAside: 'None', popCity: 'Gaithersburg', popState: 'MD',
    description: 'NIST will host an industry day on AI adoption strategy for federal measurement science programs. Attendance is open; registration required. Future solicitations may follow.',
    valueLabel: '', valueDollars: null, matchScore: 42,
    factors: [
      f('NAICS match', 60, 25, '541611 is in your registered NAICS list.'),
      f('Set-aside eligibility', 50, 15, 'Open event.'),
      f('Past performance relevance', 35, 25, 'Measurement science domain is new.'),
      f('Contract vehicle fit', 50, 15, 'No vehicle dependency yet.'),
      f('Geography', 90, 10, 'Gaithersburg, MD — within your primary geography.'),
      f('Keyword relevance', 40, 10, 'AI strategy matches your data science practice area.'),
    ],
  })

  const o10 = await mkOpp({
    noticeType: 'solicitation', title: 'Facility Condition Assessment Mobile Application Development',
    solicitationNumber: '140P0125Q0019', agency: 'Department of the Interior', subTier: 'National Park Service',
    office: 'NPS Facility Management', postedOffset: -14, deadlineOffset: 3, naics: '541511', psc: 'D399',
    setAside: '8(a)', popCity: 'Denver', popState: 'CO',
    description: 'Development of a cross-platform mobile application for facility condition assessments, including offline data collection, photo documentation, and integration with the FMSS asset database.',
    valueLabel: '$750K', valueDollars: 750000, matchScore: 44,
    factors: [
      f('NAICS match', 70, 25, '541511 is in your registered NAICS list.'),
      f('Set-aside eligibility', 10, 15, '8(a) set-aside; your SAM profile does not hold this certification.'),
      f('Past performance relevance', 55, 25, 'Mobile application work overlaps one past performance.'),
      f('Contract vehicle fit', 60, 15, 'Open competition.'),
      f('Geography', 50, 10, 'Denver, CO — outside primary geography.'),
      f('Keyword relevance', 55, 10, 'Cross-platform mobile development matches capability.'),
    ],
  })

  const o11 = await mkOpp({
    noticeType: 'presolicitation', title: 'Logistics Data Integration and Dashboard Services',
    solicitationNumber: 'W31P4Q25P00277', agency: 'Department of Defense', subTier: 'U.S. Army Contracting Command',
    office: 'ACC Redstone Arsenal', postedOffset: -5, deadlineOffset: 34, naics: '518210', psc: '7320',
    setAside: 'Small Business', popCity: 'Redstone Arsenal', popState: 'AL',
    description: 'Presolicitation for logistics data integration services: API development against logistics systems of record, data warehouse feeds, and executive dashboards for supply chain visibility.',
    valueLabel: '', valueDollars: null, matchScore: 66,
    factors: [
      f('NAICS match', 60, 25, '518210 is in your registered NAICS list.'),
      f('Set-aside eligibility', 100, 15, 'Small Business; your SAM profile qualifies.'),
      f('Past performance relevance', 60, 25, 'Data integration work is well covered in past performance.'),
      f('Contract vehicle fit', 55, 15, 'Open competition expected.'),
      f('Geography', 55, 10, 'Alabama — outside primary geography; remote delivery possible.'),
      f('Keyword relevance', 75, 10, 'API integration and dashboards match your library.'),
    ],
  })

  const o12 = await mkOpp({
    noticeType: 'solicitation', title: 'Records Management System Migration Support',
    solicitationNumber: '15BAC25Q00187', agency: 'Department of Commerce', subTier: 'Bureau of the Census',
    office: 'Census IT Acquisition', postedOffset: -20, deadlineOffset: -2, naics: '541690', psc: 'R425',
    setAside: 'None', popCity: 'Suitland', popState: 'MD',
    description: 'Support migrating legacy records management systems to a modern platform, including records inventory, metadata mapping, disposition scheduling, and user training.',
    valueLabel: '$980K', valueDollars: 980000, matchScore: 31, status: 'dismissed',
    dismissedReason: 'Outside core capability area; no records management past performance.',
    factors: [
      f('NAICS match', 40, 25, '541690 is not in your registered NAICS list.'),
      f('Set-aside eligibility', 50, 15, 'Full and open.'),
      f('Past performance relevance', 10, 25, 'No records management past performance.'),
      f('Contract vehicle fit', 55, 15, 'Open competition.'),
      f('Geography', 90, 10, 'Suitland, MD — within your primary geography.'),
      f('Keyword relevance', 20, 10, 'Records management is a capability gap.'),
    ],
  })

  // Saved searches
  await db.savedSearch.createMany({
    data: [
      { orgId: org.id, name: 'IT modernization — due within 60 days', criteriaJson: J({ naics: ['541512', '541511', '518210'], maxAgeDays: 30 }), alertsEnabled: true, digest: 'daily' },
      { orgId: org.id, name: 'Small Business set-asides — VA and DHS', criteriaJson: J({ setAsides: ['Small Business'], agencies: ['Department of Veterans Affairs', 'Department of Homeland Security'] }), alertsEnabled: true, digest: 'weekly' },
      { orgId: org.id, name: 'Data platform and analytics', criteriaJson: J({ keyword: 'data platform' }), alertsEnabled: false, digest: 'off' },
    ],
  })

  // -----------------------------------------------------------------------
  // Partners + teaming
  // -----------------------------------------------------------------------
  const partners = await Promise.all([
    db.partner.create({ data: { orgId: org.id, name: 'Silverpine Analytics', uei: 'SP8K2NQ4RVD1', capabilities: 'Data engineering, geospatial analytics, cloud data platforms', certifications: 'SDVOSB, Small Business', location: 'Colorado Springs, CO', naics: '541512', ndaStatus: 'executed', taStatus: 'executed', performanceRating: 5, notes: 'Strong record on USACE geospatial programs. Prefer sub role on VA work.' } }),
    db.partner.create({ data: { orgId: org.id, name: 'Bluefield Data Labs', uei: 'BD7T3MR2KQX8', capabilities: 'Health data interoperability, FHIR, clinical informatics', certifications: 'WOSB, Small Business', location: 'Bethesda, MD', naics: '541511', ndaStatus: 'executed', taStatus: 'negotiating', performanceRating: 4, notes: 'FHIR expertise supports the VA digital health pursuit.' } }),
    db.partner.create({ data: { orgId: org.id, name: 'Kestrel Engineering Group', uei: 'KG5R9QT1VNB3', capabilities: 'DevSecOps, platform engineering, ATO pipelines', certifications: 'Small Business', location: 'Chantilly, VA', naics: '518210', ndaStatus: 'none', taStatus: 'none', performanceRating: 4, notes: 'Met at DHS industry day; strong CIDA references.' } }),
    db.partner.create({ data: { orgId: org.id, name: 'Northgate Consulting', uei: 'NC2Q8PT4RLD6', capabilities: 'Agile coaching, human-centered design, 508 accessibility', certifications: 'Small Business', location: 'Alexandria, VA', naics: '541611', ndaStatus: 'executed', taStatus: 'executed', performanceRating: 5, notes: 'Relperienced HCD partner on two prior wins together.' } }),
    db.partner.create({ data: { orgId: org.id, name: 'Arbor Systems Inc.', uei: 'AS9M4KQ7TVC2', capabilities: 'Managed services, cloud operations, service desk', certifications: '8(a), Small Business', location: 'Reston, VA', naics: '518210', ndaStatus: 'none', taStatus: 'none', performanceRating: 3, notes: 'Candidate for operations and sustainment scope.' } }),
  ])

  // -----------------------------------------------------------------------
  // Pursuits + PWin factors + teaming
  // -----------------------------------------------------------------------
  const mkPursuit = (p: {
    opportunityId?: string; title: string; agency: string; stage: string; lead: string;
    expectedDollars: number; totalDollars: number; pwin: number;
    factors: { key: string; label: string; score: number; weight: number; detail: string }[];
    gateStatus?: string; gateDecision?: string; gateScore?: { key: string; label: string; score: number; weight: number; comment: string }[];
    gateApprovedBy?: string; noBidReason?: string; competitorNote?: string; winThemes?: string[]; decisionOffset?: number;
  }) => db.pursuit.create({
    data: {
      orgId: org.id,
      opportunityId: p.opportunityId ?? null,
      title: p.title, agency: p.agency, stage: p.stage, captureLead: p.lead,
      expectedValueCents: cents(p.expectedDollars), totalValueCents: cents(p.totalDollars), pwin: p.pwin,
      gateStatus: p.gateStatus ?? 'pending',
      gateDecision: p.gateDecision ?? '',
      gateScoreJson: J(p.gateScore ?? []),
      gateApprovedBy: p.gateApprovedBy ?? '',
      gateApprovedAt: p.gateApprovedBy ? day(-6) : null,
      decisionDate: p.decisionOffset !== undefined ? day(p.decisionOffset) : null,
      noBidReason: p.noBidReason ?? '',
      competitorNote: p.competitorNote ?? '',
      winThemesJson: J(p.winThemes ?? []),
    },
  }).then(async (pu) => {
    await db.pwinFactor.createMany({
      data: p.factors.map((x) => ({ pursuitId: pu.id, ...x })),
    })
    return pu
  })

  const p1 = await mkPursuit({
    opportunityId: o3.id, title: 'ERDC Enterprise Data Lakehouse', agency: 'U.S. Army Corps of Engineers ERDC',
    stage: 'identified', lead: 'Marcus Lee', expectedDollars: 4200000, totalDollars: 9600000, pwin: 35,
    factors: [
      { key: 'customer_relationship', label: 'Customer relationship', score: 75, weight: 20, detail: 'Existing COR from the Geospatial Data Platform contract is the technical lead.' },
      { key: 'solution_fit', label: 'Solution fit', score: 80, weight: 25, detail: 'Lakehouse architecture matches the data engineering practice.' },
      { key: 'incumbent_position', label: 'Incumbent position', score: 40, weight: 15, detail: 'Incumbent holds the current warehouse; recompete dynamics unclear.' },
      { key: 'price_competitiveness', label: 'Price competitiveness', score: 50, weight: 15, detail: 'No pricing intelligence yet.' },
      { key: 'past_performance', label: 'Past performance relevance', score: 90, weight: 15, detail: 'ERDC Geospatial Data Platform is directly relevant.' },
      { key: 'teaming_strength', label: 'Teaming strength', score: 60, weight: 10, detail: 'Silverpine Analytics available as geospatial sub.' },
    ],
    competitorNote: 'Incumbent (unidentified in notice) likely to propose incremental warehouse evolution.',
  })

  const p2 = await mkPursuit({
    opportunityId: o4.id, title: 'GSA Grants Management Modernization (Sources Sought)', agency: 'GSA FAS',
    stage: 'qualifying', lead: 'Marcus Lee', expectedDollars: 3100000, totalDollars: 7200000, pwin: 45,
    factors: [
      { key: 'customer_relationship', label: 'Customer relationship', score: 45, weight: 20, detail: 'Two prior GSA MAS task orders; no grants service line relationship.' },
      { key: 'solution_fit', label: 'Solution fit', score: 70, weight: 25, detail: 'Agile delivery and HCD are core strengths.' },
      { key: 'incumbent_position', label: 'Incumbent position', score: 50, weight: 15, detail: 'Strategy not yet set; acquisition approach pending market research.' },
      { key: 'price_competitiveness', label: 'Price competitiveness', score: 55, weight: 15, detail: 'Awaiting CALC+ benchmark pull for LCATs.' },
      { key: 'past_performance', label: 'Past performance relevance', score: 65, weight: 15, detail: 'Agile platform delivery for IRS is adjacent.' },
      { key: 'teaming_strength', label: 'Teaming strength', score: 85, weight: 10, detail: 'Northgate Consulting signed on for HCD scope.' },
    ],
  })

  const p3 = await mkPursuit({
    opportunityId: o8.id, title: 'NAVFAC Enterprise GIS Sustainment', agency: 'Department of the Navy NAVFAC Atlantic',
    stage: 'capture', lead: 'Marcus Lee', expectedDollars: 1100000, totalDollars: 1400000, pwin: 55,
    factors: [
      { key: 'customer_relationship', label: 'Customer relationship', score: 50, weight: 20, detail: 'Introduced at FedGIS conference; follow-up meetings scheduled.' },
      { key: 'solution_fit', label: 'Solution fit', score: 85, weight: 25, detail: 'ArcGIS administration and data pipelines are proven capabilities.' },
      { key: 'incumbent_position', label: 'Incumbent position', score: 35, weight: 15, detail: 'Incumbent has held this five years; customer signals openness to change.' },
      { key: 'price_competitiveness', label: 'Price competitiveness', score: 60, weight: 15, detail: 'Benchmarks pulled; small business rates competitive.' },
      { key: 'past_performance', label: 'Past performance relevance', score: 90, weight: 15, detail: 'USACE geospatial platform work maps directly.' },
      { key: 'teaming_strength', label: 'Teaming strength', score: 80, weight: 10, detail: 'Silverpine Analytics executed TA for geospatial scope.' },
    ],
    competitorNote: 'Two large-business primes likely to bid with small business subs. Watch 8(a) competitors on set-aside decision.',
    winThemes: ['Proven geospatial platform operations at USACE scale', 'Single accountable delivery team with DoD platform experience'],
  })

  const p4 = await mkPursuit({
    opportunityId: o11.id, title: 'Army Logistics Data Integration', agency: 'Army Contracting Command Redstone',
    stage: 'bid_decision', lead: 'Marcus Lee', expectedDollars: 2400000, totalDollars: 5100000, pwin: 50,
    factors: [
      { key: 'customer_relationship', label: 'Customer relationship', score: 30, weight: 20, detail: 'No current Redstone relationships; introductions needed.' },
      { key: 'solution_fit', label: 'Solution fit', score: 75, weight: 25, detail: 'API integration and dashboards are proven capabilities.' },
      { key: 'incumbent_position', label: 'Incumbent position', score: 45, weight: 15, detail: 'Presolicitation; incumbent unknown.' },
      { key: 'price_competitiveness', label: 'Price competitiveness', score: 55, weight: 15, detail: 'Early benchmark ranges collected.' },
      { key: 'past_performance', label: 'Past performance relevance', score: 60, weight: 15, detail: 'Logistics integration partially covered by IRS data work.' },
      { key: 'teaming_strength', label: 'Teaming strength', score: 40, weight: 10, detail: 'Teaming discussions started, no executed agreements.' },
    ],
  })

  const p5 = await mkPursuit({
    opportunityId: o1.id, title: 'VHA Digital Health Platform Modernization', agency: 'Department of Veterans Affairs VHA',
    stage: 'proposal', lead: 'Marcus Lee', expectedDollars: 6800000, totalDollars: 8600000, pwin: 62,
    factors: [
      { key: 'customer_relationship', label: 'Customer relationship', score: 70, weight: 20, detail: 'Two prior VHA task orders; program office familiar with delivery team.' },
      { key: 'solution_fit', label: 'Solution fit', score: 90, weight: 25, detail: 'Platform re-architecture and agile delivery are core offerings.' },
      { key: 'incumbent_position', label: 'Incumbent position', score: 45, weight: 15, detail: 'Incumbent underperforming on velocity; customer seeking change.' },
      { key: 'price_competitiveness', label: 'Price competitiveness', score: 65, weight: 15, detail: 'Cost model complete; rates within CALC+ range.' },
      { key: 'past_performance', label: 'Past performance relevance', score: 85, weight: 15, detail: 'VA and HHS platform modernization records apply.' },
      { key: 'teaming_strength', label: 'Teaming strength', score: 85, weight: 10, detail: 'Bluefield (FHIR/health data) and Northgate (HCD) executed TAs.' },
    ],
    gateStatus: 'approved', gateDecision: 'Bid',
    gateScore: [
      { key: 'strategic_fit', label: 'Strategic fit with growth plan', score: 5, weight: 20, comment: 'Digital health is a named growth area.' },
      { key: 'customer_knowledge', label: 'Customer and requirement knowledge', score: 4, weight: 20, comment: 'Strong program office insight; contracting specifics pending RFP Q&A.' },
      { key: 'competitive_position', label: 'Competitive position', score: 4, weight: 20, comment: 'Incumbent weakness creates an opening.' },
      { key: 'resources', label: 'Resource availability', score: 4, weight: 15, comment: 'Staffing plan validated with delivery organization.' },
      { key: 'past_performance', label: 'Relevant past performance', score: 5, weight: 15, comment: 'Two directly relevant VA records.' },
      { key: 'risk', label: 'Contract and delivery risk', score: 4, weight: 10, comment: 'Manageable; ramp plan addresses key person risk.' },
    ],
    gateApprovedBy: 'Dana Whitfield',
    decisionOffset: -14,
    winThemes: [
      'Delivery velocity the incumbent could not sustain — 14 releases per quarter on the current platform',
      'Health data interoperability depth through the Bluefield partnership (FHIR R2B certified pipeline)',
      'Human-centered design that raised VA patient portal satisfaction 18 points',
    ],
  })

  const p6 = await mkPursuit({
    opportunityId: o7.id, title: 'IRS Taxpayer Web Applications Modernization', agency: 'Internal Revenue Service',
    stage: 'submitted', lead: 'Marcus Lee', expectedDollars: 3900000, totalDollars: 9200000, pwin: 48,
    factors: [
      { key: 'customer_relationship', label: 'Customer relationship', score: 55, weight: 20, detail: 'IRS Online Services knows the team from prior data work.' },
      { key: 'solution_fit', label: 'Solution fit', score: 80, weight: 25, detail: 'Web modernization and 508 remediation are core capabilities.' },
      { key: 'incumbent_position', label: 'Incumbent position', score: 40, weight: 15, detail: 'Three strong competitors expected.' },
      { key: 'price_competitiveness', label: 'Price competitiveness', score: 60, weight: 15, detail: 'Priced within benchmark corridor.' },
      { key: 'past_performance', label: 'Past performance relevance', score: 75, weight: 15, detail: 'IRS data platform record directly relevant.' },
      { key: 'teaming_strength', label: 'Teaming strength', score: 80, weight: 10, detail: 'Northgate executed for HCD and accessibility scope.' },
    ],
    gateStatus: 'approved', gateDecision: 'Bid', gateApprovedBy: 'Dana Whitfield',
    decisionOffset: -40,
  })

  const p7 = await mkPursuit({
    title: 'HHS Program Management Support (No-Bid)', agency: 'Department of Health and Human Services',
    stage: 'lost', lead: 'Marcus Lee', expectedDollars: 0, totalDollars: 1800000, pwin: 30,
    factors: [
      { key: 'customer_relationship', label: 'Customer relationship', score: 20, weight: 20, detail: 'No HHS program office relationship.' },
      { key: 'solution_fit', label: 'Solution fit', score: 40, weight: 25, detail: 'Program management support is not a core offering.' },
      { key: 'incumbent_position', label: 'Incumbent position', score: 20, weight: 15, detail: 'Incumbent with 8-year tenure.' },
      { key: 'price_competitiveness', label: 'Price competitiveness', score: 50, weight: 15, detail: 'Labor-heavy scope with thin margins for small business.' },
      { key: 'past_performance', label: 'Past performance relevance', score: 30, weight: 15, detail: 'No PM support past performance.' },
      { key: 'teaming_strength', label: 'Teaming strength', score: 30, weight: 10, detail: 'No partner identified in time.' },
    ],
    gateStatus: 'rejected', gateDecision: 'No-Bid',
    gateScore: [
      { key: 'strategic_fit', label: 'Strategic fit with growth plan', score: 2, weight: 20, comment: 'Outside growth areas.' },
      { key: 'customer_knowledge', label: 'Customer and requirement knowledge', score: 2, weight: 20, comment: 'No relationships or insight.' },
      { key: 'competitive_position', label: 'Competitive position', score: 2, weight: 20, comment: 'Strong incumbent, low differentiation.' },
      { key: 'resources', label: 'Resource availability', score: 3, weight: 15, comment: 'Would compete with VA staffing.' },
      { key: 'past_performance', label: 'Relevant past performance', score: 2, weight: 15, comment: 'No relevant records.' },
      { key: 'risk', label: 'Contract and delivery risk', score: 3, weight: 10, comment: 'Staff augmentation risk with thin margin.' },
    ],
    gateApprovedBy: 'Dana Whitfield',
    noBidReason: 'No customer relationship, no relevant past performance, and it competes for the same staff as two stronger pursuits.',
  })

  // Teaming agreements
  await db.teamingAgreement.createMany({
    data: [
      { orgId: org.id, pursuitId: p3.id, partnerId: partners[0].id, role: 'Subcontractor', worksharePct: 30, ndaStatus: 'executed', taStatus: 'executed' },
      { orgId: org.id, pursuitId: p5.id, partnerId: partners[1].id, role: 'Subcontractor', worksharePct: 25, ndaStatus: 'executed', taStatus: 'negotiating' },
      { orgId: org.id, pursuitId: p5.id, partnerId: partners[3].id, role: 'Subcontractor', worksharePct: 15, ndaStatus: 'executed', taStatus: 'executed' },
      { orgId: org.id, pursuitId: p6.id, partnerId: partners[3].id, role: 'Subcontractor', worksharePct: 20, ndaStatus: 'executed', taStatus: 'executed' },
    ],
  })

  // -----------------------------------------------------------------------
  // Proposals (main: VHA Digital Health Platform)
  // -----------------------------------------------------------------------
  const prop5 = await db.proposal.create({
    data: {
      orgId: org.id, pursuitId: p5.id,
      title: 'VHA Digital Health Platform Modernization',
      solicitationNumber: '36C25X25Q0187',
      agency: 'Department of Veterans Affairs',
      status: 'writing', dueAt: day(18, 17), contractType: 'FFP',
      notes: 'Two-volume proposal (Technical, Price). Red Team review scheduled before gold team final check.',
    },
  })

  const prop6 = await db.proposal.create({
    data: {
      orgId: org.id, pursuitId: p6.id,
      title: 'IRS Taxpayer Web Applications Modernization',
      solicitationNumber: 'TIRNO-25-R-00022',
      agency: 'Internal Revenue Service',
      status: 'submitted', dueAt: day(-11, 17), contractType: 'FFP',
    },
  })

  // --- Requirements + sections for prop6 (submitted IRS proposal) ---
  const req6 = (ref: string, kind: string, obligation: string, sourceDoc: string, page: number, paragraph: string, text: string, excerpt: string, sectionKey: string, confidence: number) =>
    db.requirement.create({
      data: { proposalId: prop6.id, ref, kind, obligation, sourceDoc, page, paragraph, text, sourceExcerpt: excerpt, sectionKey, confidence, status: 'confirmed', owner: 'Priya Nair' },
    })
  await Promise.all([
    req6('L-1.1', 'instruction', 'shall', 'Section L', 3, '1.1', 'Offerors shall limit technical proposals to twenty-five pages.', 'Volume I shall not exceed twenty-five (25) pages using 12-point or larger font.', 'tech-1', 97),
    req6('L-2.1', 'instruction', 'shall', 'Section L', 4, '2.1', 'Offerors shall describe their approach to accessibility remediation and testing.', 'The offeror shall describe its approach to WCAG 2.1 AA remediation and automated accessibility testing.', 'tech-1', 94),
    req6('M-1.1', 'evaluation', 'shall', 'Section M', 8, '1.1', 'The Government will evaluate technical approach and migration methodology.', 'Factor 1 — Technical Approach, including CMS migration methodology and rollback planning.', 'tech-1', 95),
    req6('M-2.1', 'evaluation', 'shall', 'Section M', 9, '2.1', 'The Government will evaluate relevant past performance.', 'Factor 2 — Past Performance for similarity of scope and magnitude.', 'pp-1', 96),
    req6('M-3.1', 'evaluation', 'shall', 'Section M', 10, '3.1', 'The Government will evaluate price realism.', 'Factor 3 — Price realism and completeness.', 'price-1', 97),
    req6('PWS-1.1', 'sow_task', 'shall', 'PWS', 3, '1.1', 'The contractor shall migrate legacy content to the enterprise CMS without data loss.', '1.1 Content Migration. The Contractor shall migrate existing content preserving metadata, redirects, and access controls.', 'tech-1', 93),
    req6('PWS-2.1', 'sow_task', 'shall', 'PWS', 4, '2.1', 'The contractor shall operate a two-week sprint cadence with open sprint reviews.', 'The Contractor shall operate two-week sprints with sprint reviews open to Government stakeholders.', 'mgmt-1', 92),
    req6('PWS-3.1', 'sow_task', 'shall', 'PWS', 5, '3.1', 'The contractor shall remediate accessibility defects to WCAG 2.1 AA within two sprints of discovery.', 'Accessibility defects shall be remediated to WCAG 2.1 AA within two sprints of discovery.', 'tech-1', 91),
    req6('CDRL-A001', 'deliverable', 'shall', 'CDRL A001', 1, 'A001', 'The contractor shall deliver a Project Management Plan within 30 days of award.', 'CDRL A001 — Program Management Plan, due 30 days after award.', 'mgmt-1', 98),
    req6('CDRL-A002', 'deliverable', 'shall', 'CDRL A002', 1, 'A002', 'The contractor shall deliver monthly progress reports.', 'CDRL A002 — Monthly Progress Report, due the fifth business day of each month.', 'mgmt-1', 98),
    req6('FAR-52.204-7', 'clause', 'shall', 'FAR 52.204-7', 12, '52.204-7', 'Offerors shall be registered in SAM at submission.', 'FAR 52.204-7 System for Award Management.', 'submit-1', 99),
    req6('FAR-52.219-1', 'clause', 'shall', 'FAR 52.219-1', 13, '52.219-1', 'Offerors shall complete small business representations.', 'FAR 52.219-1 Small Business Program Representations.', 'submit-1', 99),
  ])
  const sec6 = (volume: string, key: string, title: string, order: number, status: string) =>
    db.proposalSection.create({
      data: { proposalId: prop6.id, volume, key, title, instructions: '', pageLimit: 5, assignee: 'Priya Nair', order, status, winTheme: '', content: status === 'final' ? 'Final content submitted with the proposal. (Sample record retained for the demonstration workspace.)' : '' },
    })
  await Promise.all([
    sec6('Technical', 'tech-1', '1. Technical Approach and Migration Methodology', 1, 'final'),
    sec6('Management', 'mgmt-1', '2. Program Management and Cadence', 2, 'final'),
    sec6('Past Performance', 'pp-1', '3. Relevant Past Performance', 3, 'final'),
    sec6('Price', 'price-1', '4. Price Volume', 4, 'final'),
    sec6('Submission', 'submit-1', '5. Representations and Forms', 5, 'final'),
  ])
  const gold6 = await db.reviewCycle.create({
    data: { proposalId: prop6.id, kind: 'gold', status: 'complete', scheduledAt: day(-14), summaryJson: J({ findingsTotal: 1, findingsOpen: 0, blockers: 0, notes: 'Final verification review before submission. One minor finding corrected on the spot.' }) },
  })
  await db.reviewFinding.create({
    data: { reviewId: gold6.id, proposalId: prop6.id, sectionKey: 'tech-1', severity: 'minor', comment: 'Migration rollback plan referenced an outdated tool version.', disposition: 'accepted', response: 'Updated to the current tool version before submission.' },
  })

  // --- Requirements for prop5 (compliance matrix, ~40 rows) ---
  const req = (
    ref: string, kind: string, obligation: string, sourceDoc: string, page: number, paragraph: string,
    text: string, excerpt: string, sectionKey: string, confidence: number, status = 'extracted', owner = 'Priya Nair',
  ) => db.requirement.create({
    data: { proposalId: prop5.id, ref, kind, obligation, sourceDoc, page, paragraph, text, sourceExcerpt: excerpt, sectionKey, confidence, status, owner },
  })

  await Promise.all([
    // Section L instructions
    req('L-1.1', 'instruction', 'shall', 'Section L', 2, '1.1', 'Offerors shall submit proposals in two volumes: Volume I — Technical and Volume II — Price.', 'The offeror shall submit two volumes. Volume I, Technical, shall not exceed 40 pages. Volume II, Price, shall use the pricing templates provided.', 'tech-1', 96, 'confirmed'),
    req('L-1.2', 'instruction', 'shall', 'Section L', 2, '1.2', 'Volume I shall not exceed forty (40) pages, inclusive of all annexes, using 12-point or larger font.', 'Volume I shall not exceed forty (40) pages including all annexes, resumes, and letters of commitment. Font shall be 12 point or larger.', 'tech-1', 97, 'confirmed'),
    req('L-1.3', 'instruction', 'shall', 'Section L', 3, '1.3', 'Offerors shall include a compliance matrix cross-referencing every Section M factor and PWS task to the proposal page addressing it.', 'A compliance matrix shall be provided cross-referencing each evaluation factor in Section M and each task in the PWS to the page of Volume I where it is addressed.', 'tech-1', 94, 'confirmed'),
    req('L-2.1', 'instruction', 'shall', 'Section L', 3, '2.1', 'Technical proposals shall address the offeror’s technical approach, management plan, staffing plan, and transition plan.', 'The technical proposal shall include, at a minimum: technical approach, management plan, staffing and retention plan, and a transition-in plan covering the first 60 days.', 'tech-2', 95),
    req('L-2.2', 'instruction', 'shall', 'Section L', 4, '2.2', 'Resumes for proposed key personnel shall not exceed two pages each and shall be included as Annex C.', 'Resumes for the Program Manager, Solution Architect, and DevSecOps Lead are required and shall not exceed two pages each. Annex C.', 'tech-2', 96),
    req('L-2.3', 'instruction', 'should', 'Section L', 4, '2.3', 'Offerors should describe their approach to knowledge management and continuous learning across the delivery team.', 'Offerors should describe approaches to knowledge management, communities of practice, and continuous learning for the delivery organization.', 'mgmt-2', 88),
    req('L-3.1', 'instruction', 'shall', 'Section L', 5, '3.1', 'Past performance citations shall reference no more than three contracts performed within the last five years.', 'The offeror shall cite no more than three contracts performed within five years of the solicitation date. Each citation shall include CPARS ratings or comparable metrics.', 'pp-1', 95),
    req('L-4.1', 'instruction', 'shall', 'Section L', 6, '4.1', 'Price proposals shall be submitted using the CLIN structure in Section B and the provided workbook template.', 'Volume II shall use the pricing workbook template provided under attachment 4 and follow the CLIN structure in Section B without modification.', 'price-1', 97, 'confirmed', 'Sam Ortiz'),
    req('L-5.1', 'clause', 'shall', 'Section L', 7, '5.1', 'Offerors shall complete representations and certifications in SAM at the time of submission.', 'All representations and certifications required by FAR 52.204-8 shall be current in SAM.gov at the time of proposal submission.', 'submit-1', 98, 'confirmed'),
    // Section M evaluation criteria
    req('M-1.1', 'evaluation', 'shall', 'Section M', 9, '1.1', 'The Government will evaluate the technical approach factor for soundness, innovation, and alignment with the target architecture.', 'Factor 1 — Technical Approach. The Government will evaluate the soundness and innovation of the technical approach, and its alignment with the VA Enterprise Architecture and industry practices.', 'tech-3', 93, 'confirmed'),
    req('M-1.2', 'evaluation', 'shall', 'Section M', 9, '1.2', 'The Government will evaluate the offeror’s approach to release velocity and continuous integration/continuous deployment.', 'Under Factor 1, the Government will evaluate the approach to CI/CD, release velocity, automated testing coverage, and deployment risk reduction.', 'tech-3', 92, 'confirmed'),
    req('M-1.3', 'evaluation', 'shall', 'Section M', 10, '1.3', 'The Government will evaluate the security and privacy engineering approach, including ATO alignment.', 'Under Factor 1, the Government will evaluate security and privacy engineering, including alignment with NIST SP 800-53 moderate baseline and continuous ATO practices.', 'tech-4', 91),
    req('M-2.1', 'evaluation', 'shall', 'Section M', 10, '2.1', 'The Government will evaluate key personnel qualifications, availability, and retention approach.', 'Factor 2 — Key Personnel. Qualifications, certifications, availability commitments, and the retention plan for the Program Manager, Solution Architect, and DevSecOps Lead will be evaluated.', 'tech-2', 94),
    req('M-2.2', 'evaluation', 'shall', 'Section M', 11, '2.2', 'The Government will evaluate the staffing plan for realism and the adequacy of surge capacity.', 'The staffing plan will be evaluated for realism against the delivery schedule, labor category mix, and surge capacity of at least 20 percent for two consecutive sprints.', 'mgmt-1', 90),
    req('M-3.1', 'evaluation', 'shall', 'Section M', 11, '3.1', 'The Government will evaluate the management plan, including delivery governance and risk management.', 'Factor 3 — Management Plan. The Government will evaluate governance structures, communication cadence, risk and issue management, and quality assurance practices.', 'mgmt-2', 92),
    req('M-3.2', 'evaluation', 'shall', 'Section M', 12, '3.2', 'The Government will evaluate the transition-in plan for completeness and low-risk onboarding.', 'The transition-in plan will be evaluated for completeness, knowledge transfer from the incumbent, and continuity of the release pipeline during the first 60 days.', 'mgmt-3', 93),
    req('M-4.1', 'evaluation', 'shall', 'Section M', 12, '4.1', 'The Government will evaluate relevant past performance for similarity of scope, magnitude, and complexity.', 'Factor 4 — Past Performance. The Government will evaluate the relevance of cited contracts for similarity of scope, magnitude, and complexity. CPARS ratings will be considered.', 'pp-1', 95, 'confirmed'),
    req('M-4.2', 'evaluation', 'should', 'Section M', 13, '4.2', 'The Government may consider the offeror’s record of small business subcontracting utilization.', 'The Government may consider demonstrated small business utilization consistent with the subcontracting plan submitted under Volume II.', 'pp-2', 82),
    req('M-5.1', 'evaluation', 'shall', 'Section M', 13, '5.1', 'Price proposals will be evaluated for realism and completeness; unbalanced pricing may be grounds for rejection.', 'Factor 5 — Price. The Government will evaluate price realism and completeness. Maternally unbalanced pricing may be rejected.', 'price-1', 96, 'confirmed', 'Sam Ortiz'),
    // PWS tasks
    req('PWS-1.1', 'sow_task', 'shall', 'PWS', 4, '1.1', 'The contractor shall re-architect the veteran portal front end using a component-based design system with WCAG 2.1 AA conformance.', '1.1 Portal Re-architecture. The Contractor shall re-architect the veteran-facing portal using a component-based design system and shall conform to WCAG 2.1 AA accessibility standards.', 'tech-3', 94, 'confirmed'),
    req('PWS-1.2', 'sow_task', 'shall', 'PWS', 5, '1.2', 'The contractor shall maintain a shared component library with documented accessibility test results per release.', 'The Contractor shall maintain a shared component library, versioned and documented, with automated accessibility test results published for each release.', 'tech-3', 89),
    req('PWS-1.3', 'sow_task', 'shall', 'PWS', 5, '1.3', 'The contractor shall establish a DevSecOps pipeline with automated security scanning and test coverage of at least 80 percent.', 'The Contractor shall implement a DevSecOps pipeline including SAST, DAST, and dependency scanning, with automated test coverage of not less than 80 percent of changed code.', 'tech-4', 92, 'confirmed'),
    req('PWS-2.1', 'sow_task', 'shall', 'PWS', 6, '2.1', 'The contractor shall deliver a minimum of six production releases per quarter across the platform.', '2.1 Delivery Velocity. The Contractor shall deliver not fewer than six production releases per quarter, measured from the second full quarter of performance.', 'tech-3', 95, 'confirmed'),
    req('PWS-2.2', 'sow_task', 'shall', 'PWS', 6, '2.2', 'The contractor shall operate a two-week sprint cadence with sprint reviews open to Government stakeholders.', 'The Contractor shall operate on a two-week sprint cadence and shall hold sprint reviews open to Government stakeholders, with recordings and minutes archived.', 'mgmt-2', 93),
    req('PWS-2.3', 'sow_task', 'should', 'PWS', 7, '2.3', 'The contractor should propose analytics that measure adoption and task success for delivered capabilities.', 'The Contractor should propose product analytics measuring adoption, task success, and time-on-task for delivered capabilities, with a monthly metrics review.', 'tech-3', 84),
    req('PWS-3.1', 'sow_task', 'shall', 'PWS', 7, '3.1', 'The contractor shall integrate health data interfaces using FHIR R4 APIs with the VHA integration engine.', '3.1 Health Data Integration. The Contractor shall integrate interfaces using HL7 FHIR R4 APIs with the VHA integration engine, including patient scheduling and pharmacy data domains.', 'tech-5', 93),
    req('PWS-3.2', 'sow_task', 'shall', 'PWS', 8, '3.2', 'The contractor shall implement data quality monitoring with automated alerting for interface failures.', 'The Contractor shall implement data quality monitoring with automated alerting for interface failures, achieving a 99.5 percent interface availability target.', 'tech-5', 91),
    req('PWS-3.3', 'sow_task', 'may', 'PWS', 8, '3.3', 'The Government may direct additional interface domains through the change control process.', 'The Government may direct additional interface domains through the change control process defined in Section 6 of the PWS.', 'mgmt-2', 78),
    req('PWS-4.1', 'sow_task', 'shall', 'PWS', 9, '4.1', 'The contractor shall staff the program with key personnel approved by the COR and shall not replace them without Government approval.', '4.1 Key Personnel. The Contractor shall staff the Program Manager, Solution Architect, and DevSecOps Lead positions with individuals approved by the COR. Replacement requires prior Government approval.', 'tech-2', 96, 'confirmed'),
    req('PWS-4.2', 'sow_task', 'shall', 'PWS', 9, '4.2', 'The contractor shall submit a staffing plan with labor categories, rates, and fill status monthly.', 'The Contractor shall submit a staffing plan monthly, including labor categories, rates, filled and open positions, and time-to-fill metrics.', 'mgmt-1', 94),
    req('PWS-5.1', 'sow_task', 'shall', 'PWS', 10, '5.1', 'The contractor shall provide a 60-day transition-in plan with knowledge transfer milestones and continuity safeguards.', '5.1 Transition. The Contractor shall provide a transition-in plan covering the first 60 days, with knowledge transfer milestones, continuity safeguards for the release pipeline, and a go/no-go readiness gate.', 'mgmt-3', 95),
    req('PWS-5.2', 'sow_task', 'shall', 'PWS', 11, '5.2', 'The contractor shall maintain a risk register with mitigation owners reviewed at the monthly program review.', 'The Contractor shall maintain a program risk register with likelihood, impact, and mitigation owners, reviewed at the monthly program management review.', 'mgmt-2', 92),
    req('PWS-5.3', 'sow_task', 'shall', 'PWS', 11, '5.3', 'The contractor shall deliver all services from a FedRAMP-authorized cloud environment.', 'All services shall be delivered from a cloud environment authorized under FedRAMP at the Moderate impact level, with boundary documentation maintained current.', 'tech-4', 96, 'confirmed'),
    // CDRLs
    req('CDRL-A001', 'deliverable', 'shall', 'CDRL A001', 1, 'A001', 'The contractor shall deliver a Program Management Plan within 30 days of award.', 'CDRL A001 — Program Management Plan, DID DI-MGMT-81650, due 30 days after award, accepted by the COR.', 'mgmt-2', 97, 'confirmed'),
    req('CDRL-A002', 'deliverable', 'shall', 'CDRL A002', 1, 'A002', 'The contractor shall deliver monthly status reports by the fifth business day of each month.', 'CDRL A002 — Monthly Status Report, DID DI-MGMT-81466A, due the fifth business day following each reporting month.', 'mgmt-2', 98, 'confirmed'),
    req('CDRL-A003', 'deliverable', 'shall', 'CDRL A003', 2, 'A003', 'The contractor shall deliver a Security Authorization Package (ATO) within 90 days of award.', 'CDRL A003 — Security Authorization Package per NIST SP 800-37, due 90 days after award for the moderate baseline.', 'tech-4', 95),
    req('CDRL-A004', 'deliverable', 'shall', 'CDRL A004', 2, 'A004', 'The contractor shall deliver a Transition-In Plan within 15 days of award.', 'CDRL A004 — Transition-In Plan, due 15 days after award, addressing the 60-day plan requirements of PWS 5.1.', 'mgmt-3', 96),
    req('CDRL-A005', 'deliverable', 'shall', 'CDRL A005', 3, 'A005', 'The contractor shall deliver quarterly release retrospective and metrics reports.', 'CDRL A005 — Quarterly Release Report, including velocity, quality, accessibility, and availability metrics with retrospective analysis.', 'tech-3', 93),
    // FAR clauses
    req('FAR-52.219-1', 'clause', 'shall', 'FAR 52.219-1', 24, '52.219-1', 'Offerors shall complete the small business program representations in the solicitation.', 'FAR 52.219-1 Small Business Program Representations applies to this acquisition. Representations shall be completed as part of the solicitation.', 'submit-1', 99, 'confirmed'),
    req('FAR-52.204-7', 'clause', 'shall', 'FAR 52.204-7', 25, '52.204-7', 'Offerors shall be registered in SAM at the time of proposal submission.', 'FAR 52.204-7 System for Award Management requires offerors to be actively registered in SAM at the time of proposal submission.', 'submit-1', 99, 'confirmed'),
    req('FAR-52.237-9', 'clause', 'may', 'FAR 52.237-9', 26, '52.237-9', 'The Government may evaluate site visit attendance at its discretion.', 'FAR 52.237-9 Site Visit may apply; attendance is at the offeror’s discretion and will not be evaluated.', 'submit-1', 85),
    req('FAR-52.247-34', 'clause', 'shall', 'FAR 52.247-34', 27, '52.247-34', 'The contractor shall be responsible for f.o.b. destination delivery of all deliverables.', 'FAR 52.247-34 F.o.b. Destination applies to physical deliverables under this contract.', 'submit-1', 80),
  ])

  // --- Sections (annotated outline) for prop5 ---
  const sec = (s: {
    volume: string; key: string; title: string; instructions: string; pageLimit: number | null;
    assignee: string; order: number; status: string; content?: string; winTheme?: string; dueOffset?: number;
  }) =>
    db.proposalSection.create({
      data: {
        proposalId: prop5.id, volume: s.volume, key: s.key, title: s.title, instructions: s.instructions,
        pageLimit: s.pageLimit, assignee: s.assignee, order: s.order, status: s.status,
        content: s.content ?? '', winTheme: s.winTheme ?? '',
        dueDate: s.dueOffset !== undefined ? day(s.dueOffset) : null,
      },
    })

  await Promise.all([
    sec({ volume: 'Technical', key: 'tech-1', title: '1. Executive Summary and Compliance Matrix', instructions: 'Summarize the offer and solution in two pages. Reference the compliance matrix.', pageLimit: 4, assignee: 'Priya Nair', order: 1, status: 'final', content: 'Harbor Point Technologies delivers the digital health platform velocity VHA needs. Over the last two years our teams delivered 56 production releases on the VA portal estate with 99.94% availability, and we bring the same engineering discipline here: a WCAG 2.1 AA component library, continuous ATO security practices, and a FHIR-first integration approach. This proposal complies with every instruction in Section L and every evaluation factor in Section M; the compliance matrix in Annex A maps each requirement to its response.', winTheme: '', dueOffset: -2 }),
    sec({ volume: 'Technical', key: 'tech-2', title: '2. Key Personnel and Staffing Approach', instructions: 'Present key personnel, their availability, and the retention approach. Resumes go in Annex C.', pageLimit: 6, assignee: 'Priya Nair', order: 2, status: 'in_review', winTheme: 'Continuity of leadership: the same PM and architect who delivered our two VA programs will lead this one.', dueOffset: -1 }),
    sec({ volume: 'Technical', key: 'tech-3', title: '3. Technical Approach and Delivery Velocity', instructions: 'Describe the technical approach for portal re-architecture, component library, and release velocity commitments.', pageLimit: 12, assignee: 'Tom Becker', order: 3, status: 'drafting', winTheme: 'Release velocity as an engineering discipline: trunk-based development, automated testing above 80 percent, and deployment pipelines that make six releases per quarter the floor, not the ceiling.', dueOffset: 3 }),
    sec({ volume: 'Technical', key: 'tech-4', title: '4. Security, Privacy, and Compliance Engineering', instructions: 'Describe the DevSecOps pipeline, security controls alignment, and the path to continuous ATO.', pageLimit: 6, assignee: 'Tom Becker', order: 4, status: 'not_started', winTheme: 'Security built into the pipeline, not bolted on: continuous ATO from day one of operations.', dueOffset: 6 }),
    sec({ volume: 'Technical', key: 'tech-5', title: '5. Health Data Integration Approach', instructions: 'Describe FHIR R4 integration with the VHA engine, data quality monitoring, and interface availability.', pageLimit: 6, assignee: 'Tom Becker', order: 5, status: 'not_started', winTheme: 'FHIR-first interoperability with the Bluefield partnership’s certified pipeline.', dueOffset: 8 }),
    sec({ volume: 'Management', key: 'mgmt-1', title: '6. Staffing Plan and Surge Capacity', instructions: 'Provide the staffing plan against the delivery schedule, including surge capacity of at least 20 percent.', pageLimit: 4, assignee: 'Marcus Lee', order: 6, status: 'drafting', dueOffset: 5 }),
    sec({ volume: 'Management', key: 'mgmt-2', title: '7. Program Management, Governance, and Knowledge Management', instructions: 'Describe governance, cadence, risk management, QA, and knowledge management.', pageLimit: 5, assignee: 'Marcus Lee', order: 7, status: 'not_started', dueOffset: 7 }),
    sec({ volume: 'Management', key: 'mgmt-3', title: '8. Transition-In Plan', instructions: 'Provide the 60-day transition plan with knowledge transfer milestones and continuity safeguards.', pageLimit: 5, assignee: 'Marcus Lee', order: 8, status: 'not_started', dueOffset: 9 }),
    sec({ volume: 'Past Performance', key: 'pp-1', title: '9. Relevant Past Performance', instructions: 'Cite up to three contracts from the last five years with CPARS ratings and relevance narratives.', pageLimit: 6, assignee: 'Dana Whitfield', order: 9, status: 'drafting', winTheme: 'Our past performance is the proof: the same team, the same architecture, and the same results — on VA and HHS platforms.', dueOffset: 4 }),
    sec({ volume: 'Past Performance', key: 'pp-2', title: '10. Small Business Utilization', instructions: 'Describe small business subcontracting approach and commitments.', pageLimit: 2, assignee: 'Dana Whitfield', order: 10, status: 'not_started', dueOffset: 10 }),
    sec({ volume: 'Price', key: 'price-1', title: '11. Price Volume and CLIN Structure', instructions: 'Complete the provided pricing workbook. Unbalanced pricing may be rejected.', pageLimit: 3, assignee: 'Sam Ortiz', order: 11, status: 'not_started', dueOffset: 12 }),
    sec({ volume: 'Submission', key: 'submit-1', title: '12. Representations, Certifications, and Forms', instructions: 'Confirm SAM registrations and complete required representations.', pageLimit: 0, assignee: 'Elena Ruiz', order: 12, status: 'not_started', dueOffset: 13 }),
  ])

  // Give tech-3 partial content
  const tech3 = await db.proposalSection.findFirst({ where: { proposalId: prop5.id, key: 'tech-3' } })
  if (tech3) {
    await db.proposalSection.update({
      where: { id: tech3.id },
      data: {
        content: 'Our technical approach treats the veteran portal as a product platform, not a project. We re-architect the front end around a versioned component library (PWS 1.1, 1.2), where every component ships with documented accessibility test results against WCAG 2.1 AA. Delivery velocity is an engineering discipline: trunk-based development, automated test coverage above 80 percent on changed code (PWS 1.3), and deployment pipelines that make six production releases per quarter the floor rather than the ceiling (PWS 2.1).',
      },
    })
  }

  // --- Review cycle: Blue team complete on prop5 ---
  const blue = await db.reviewCycle.create({
    data: { proposalId: prop5.id, kind: 'blue', status: 'complete', scheduledAt: day(-5), summaryJson: J({ avgScore: 3.6, findingsOpen: 0, notes: 'Strategy and compliance review. Outline holds; win themes need sharpening in sections 4 and 5.' }) },
  })
  const red = await db.reviewCycle.create({
    data: { proposalId: prop5.id, kind: 'red', status: 'scheduled', scheduledAt: day(7), summaryJson: J({}) },
  })
  await db.reviewFinding.createMany({
    data: [
      { reviewId: blue.id, proposalId: prop5.id, sectionKey: 'tech-3', severity: 'major', comment: 'Velocity claims are strong but not yet traced to past performance metrics. Add the quarterly release data from the HHS engagement.', disposition: 'accepted', response: 'Added release metrics table and reference to CPARS rating in Past Performance section.' },
      { reviewId: blue.id, proposalId: prop5.id, sectionKey: 'tech-5', severity: 'major', comment: 'Section 5 placeholder only. FHIR approach must name the integration engine interfaces and data domains.', disposition: 'open', response: '' },
      { reviewId: blue.id, proposalId: prop5.id, sectionKey: 'mgmt-3', severity: 'minor', comment: 'Transition plan should name the go/no-go readiness gate criteria explicitly.', disposition: 'deferred', response: 'Deferred to Red Team after draft.' },
      { reviewId: blue.id, proposalId: prop5.id, sectionKey: 'pp-1', severity: 'minor', comment: 'Confirm CPARS rating citations match the final rating documents in the library.', disposition: 'accepted', response: 'Verified against library records; citations updated.' },
    ],
  })

  // -----------------------------------------------------------------------
  // Pricing
  // -----------------------------------------------------------------------
  const rateSet = await db.rateSet.create({
    data: {
      orgId: org.id, name: 'FY2025 Indirect Rates (Provisional)', effectiveDate: day(-120),
      fringeBps: 2850, overheadBps: 5240, overheadGovBps: 2150, materialHandlingBps: 1450, gaBps: 1120, feeBps: 800,
      source: 'Provisional', status: 'active',
    },
  })

  const lcat = (title: string, description: string, baseRateDollars: number, clearance: string, minYears: number, low: number, high: number) =>
    db.laborCategory.create({
      data: { rateSetId: rateSet.id, title, description, baseRateCents: cents(baseRateDollars), clearance, minYears, benchmarkLowCents: cents(low), benchmarkHighCents: cents(high) },
    })

  const lcats = await Promise.all([
    lcat('Program Manager', 'Manages program delivery, customer relationships, and financial performance.', 118, 'Public Trust', 12, 105, 142),
    lcat('Solution Architect', 'Owns the target architecture, design authority, and technical risk management.', 126, 'Public Trust', 12, 112, 151),
    lcat('Senior Software Engineer', 'Leads squad-level design and implementation across the platform.', 108, 'None', 8, 96, 129),
    lcat('Software Engineer', 'Implements user stories across the component library and services.', 92, 'None', 5, 82, 108),
    lcat('Data Engineer (FHIR)', 'Builds FHIR R4 interfaces and data quality monitoring.', 96, 'None', 5, 86, 115),
    lcat('DevSecOps Engineer', 'Operates CI/CD pipelines, security scanning, and infrastructure as code.', 104, 'None', 6, 93, 124),
    lcat('Accessibility Engineer', 'Ensures WCAG 2.1 AA conformance across the component library.', 94, 'None', 5, 84, 112),
    lcat('QA / Test Lead', 'Owns automated test strategy and release quality gates.', 95, 'None', 6, 85, 113),
    lcat('Scrum Master', 'Facilitates sprint ceremonies and delivery metrics.', 88, 'None', 5, 78, 104),
    lcat('Human-Centered Design Lead', 'Leads research, design system, and usability testing.', 102, 'None', 7, 91, 122),
  ])

  const model = await db.pricingModel.create({
    data: {
      orgId: org.id, proposalId: prop5.id, name: 'VHA Digital Health Platform — Cost Model',
      contractType: 'FFP', escalationBps: 300,
      periodsJson: J([
        { label: 'Base Period', startDate: day(75).toISOString().slice(0, 10), endDate: day(75 + 364).toISOString().slice(0, 10), months: 12 },
        { label: 'Option Period 1', startDate: day(75 + 365).toISOString().slice(0, 10), endDate: day(75 + 729).toISOString().slice(0, 10), months: 12 },
        { label: 'Option Period 2', startDate: day(75 + 730).toISOString().slice(0, 10), endDate: day(75 + 1094).toISOString().slice(0, 10), months: 12 },
        { label: 'Option Period 3', startDate: day(75 + 1095).toISOString().slice(0, 10), endDate: day(75 + 1459).toISOString().slice(0, 10), months: 12 },
      ]),
      status: 'draft',
    },
  })

  // Hours grid: LCAT x period (scaled to the $8.6M ceiling story, ~4 FTE core team)
  const hoursGrid: Record<number, number[]> = {
    0: [1040, 1040, 1040, 1040],        // PM (half-time)
    1: [520, 520, 520, 520],            // Solution Architect
    2: [1240, 1240, 1240, 1240],        // Senior Software Engineer
    3: [1560, 1560, 2080, 2080],        // Software Engineer
    4: [1040, 1560, 1560, 1560],        // Data Engineer (FHIR)
    5: [520, 520, 520, 520],            // DevSecOps Engineer
    6: [260, 260, 260, 260],            // Accessibility Engineer
    7: [520, 520, 520, 520],            // QA / Test Lead
    8: [520, 520, 520, 520],            // Scrum Master
    9: [520, 780, 520, 520],            // HCD Lead
  }
  const clinRefs = ['0001', '0002', '0003', '0004']
  const lineData: { modelId: string; lcatId: string; lcatTitle: string; periodIndex: number; hours: number; kind: string; clinRef: string }[] = []
  lcats.forEach((l, i) => {
    hoursGrid[i].forEach((h, p) => {
      lineData.push({ modelId: model.id, lcatId: l.id, lcatTitle: l.title, periodIndex: p, hours: h, kind: 'labor', clinRef: clinRefs[p] })
    })
  })
  // ODCs in base + each option (travel, tooling)
  lineData.push({ modelId: model.id, lcatId: lcats[0].id, lcatTitle: 'Travel and per diem', periodIndex: 0, hours: 0, kind: 'odc', clinRef: '0005' })
  lineData.push({ modelId: model.id, lcatId: lcats[0].id, lcatTitle: 'Development tooling and licenses', periodIndex: 0, hours: 0, kind: 'odc', clinRef: '0005' })
  lineData.push({ modelId: model.id, lcatId: lcats[0].id, lcatTitle: 'Travel and per diem', periodIndex: 1, hours: 0, kind: 'odc', clinRef: '0005' })
  lineData.push({ modelId: model.id, lcatId: lcats[0].id, lcatTitle: 'Travel and per diem', periodIndex: 2, hours: 0, kind: 'odc', clinRef: '0005' })
  lineData.push({ modelId: model.id, lcatId: lcats[0].id, lcatTitle: 'Travel and per diem', periodIndex: 3, hours: 0, kind: 'odc', clinRef: '0005' })
  await db.pricingLine.createMany({
    data: lineData.map((l) => ({ ...l, unitCostCents: l.kind === 'odc' ? cents(l.lcatTitle.includes('tooling') ? 36000 : 18000) : null })),
  })

  // CLINs (values computed from the rate engine at seed time, approximate here; the UI always recomputes)
  await db.clin.createMany({
    data: [
      { orgId: org.id, modelId: model.id, ref: '0001', name: 'Base Period — Technical Services', type: 'ffp', periodLabel: 'Base Period', valueCents: cents(1701000), unitPriceCents: cents(1701000), quantity: 1 },
      { orgId: org.id, modelId: model.id, ref: '0002', name: 'Option Period 1 — Technical Services', type: 'ffp', periodLabel: 'Option Period 1', valueCents: cents(1806000), unitPriceCents: cents(1806000), quantity: 1 },
      { orgId: org.id, modelId: model.id, ref: '0003', name: 'Option Period 2 — Technical Services', type: 'ffp', periodLabel: 'Option Period 2', valueCents: cents(1861000), unitPriceCents: cents(1861000), quantity: 1 },
      { orgId: org.id, modelId: model.id, ref: '0004', name: 'Option Period 3 — Technical Services', type: 'ffp', periodLabel: 'Option Period 3', valueCents: cents(1917000), unitPriceCents: cents(1917000), quantity: 1 },
      { orgId: org.id, modelId: model.id, ref: '0005', name: 'Other Direct Costs', type: 'odc', periodLabel: 'All Periods', valueCents: cents(126000), unitPriceCents: cents(126000), quantity: 1 },
    ],
  })

  // -----------------------------------------------------------------------
  // Contracts
  // -----------------------------------------------------------------------
  const c1 = await db.contract.create({
    data: {
      orgId: org.id, pursuitId: null, number: 'W912DZ24D0015', vehicle: 'Direct award', type: 'prime',
      agency: 'U.S. Army Corps of Engineers ERDC', coName: 'Karen Duckworth (KO)', corName: 'Dr. Alan Meyers (COR)',
      status: 'active', awardDate: day(-420), startDate: day(-410), endDate: day(310), popLabel: 'Base + 2 options',
      ceilingCents: cents(8400000), obligatedCents: cents(3150000), fundedCents: cents(3400000),
      closeoutJson: J([]),
    },
  })
  await db.clin.createMany({
    data: [
      { orgId: org.id, contractId: c1.id, ref: '0001', name: 'Base Period — Geospatial Platform Services', type: 'ffp', periodLabel: 'Base', valueCents: cents(2800000), unitPriceCents: cents(2800000), fundedCents: cents(2800000), quantity: 1 },
      { orgId: org.id, contractId: c1.id, ref: '0002', name: 'Option 1 — Geospatial Platform Services', type: 'ffp', periodLabel: 'Option 1', valueCents: cents(2900000), unitPriceCents: cents(2900000), fundedCents: cents(600000), quantity: 1 },
      { orgId: org.id, contractId: c1.id, ref: '0003', name: 'Option 2 — Geospatial Platform Services', type: 'ffp', periodLabel: 'Option 2', valueCents: cents(3000000), unitPriceCents: cents(3000000), fundedCents: cents(0), quantity: 1 },
      { orgId: org.id, contractId: c1.id, ref: '0004', name: 'Data Migration ODCs', type: 'odc', periodLabel: 'All', valueCents: cents(400000), unitPriceCents: cents(400000), fundedCents: cents(400000), quantity: 1 },
    ],
  })
  await db.deliverable.createMany({
    data: [
      { contractId: c1.id, title: 'Monthly Status Report', didRef: 'DI-MGMT-81466A', frequency: 'Monthly', nextDue: day(4), status: 'due_soon', lastSubmitted: day(-27), recipients: 'COR, KO' },
      { contractId: c1.id, title: 'Data Model Documentation Update', didRef: 'DI-DMRS-81445', frequency: 'Quarterly', nextDue: day(18), status: 'not_due', lastSubmitted: day(-73), recipients: 'COR' },
      { contractId: c1.id, title: 'Platform Availability and Performance Report', didRef: 'DI-MGMT-81334A', frequency: 'Monthly', nextDue: day(4), status: 'submitted', lastSubmitted: day(-1), recipients: 'COR, Technical Lead' },
      { contractId: c1.id, title: 'Security Control Assessment Summary', didRef: 'DI-SAFT-80101A', frequency: 'Semi-annual', nextDue: day(52), status: 'not_due', lastSubmitted: day(-128), recipients: 'ISSM, COR' },
      { contractId: c1.id, title: 'Configuration Management Plan Revision', didRef: 'DI-CMAN-80939', frequency: 'Annual', nextDue: day(-3), status: 'late', lastSubmitted: day(-370), recipients: 'COR' },
    ],
  })
  await db.modification.createMany({
    data: [
      { contractId: c1.id, number: 'P00001', type: 'funding', effectiveDate: day(-380), valueDeltaCents: cents(1200000), description: 'Incremental funding of $1.2M against Option 1 CLIN 0002.' },
      { contractId: c1.id, number: 'A00001', type: 'scope', effectiveDate: day(-210), valueDeltaCents: cents(180000), description: 'Added bathymetric data ingestion pipeline to the platform scope.' },
      { contractId: c1.id, number: 'P00002', type: 'funding', effectiveDate: day(-95), valueDeltaCents: cents(600000), description: 'Additional funding of $600K against Option 1 CLIN 0002.' },
    ],
  })
  await db.optionPeriod.createMany({
    data: [
      { contractId: c1.id, label: 'Option Period 1 (Year 2)', exerciseBy: day(45), preliminaryNoticeBy: day(15), exercised: false, modNumber: '' },
      { contractId: c1.id, label: 'Option Period 2 (Year 3)', exerciseBy: day(410), preliminaryNoticeBy: day(380), exercised: false, modNumber: '' },
    ],
  })
  await db.cparsEvaluation.createMany({
    data: [
      { contractId: c1.id, periodLabel: 'FY2024 (Year 1)', status: 'accepted', overallRating: 'Exceptional', ratingsJson: J([{ factor: 'Quality', rating: 'Exceptional' }, { factor: 'Schedule', rating: 'Exceptional' }, { factor: 'Cost Control', rating: 'Very Good' }, { factor: 'Management', rating: 'Exceptional' }]), narrative: 'The contractor delivered all platform milestones ahead of schedule and led the migration of 14 geospatial data pipelines with zero data loss.', responseDue: null, contractorComment: '' },
      { contractId: c1.id, periodLabel: 'FY2025 (Year 2)', status: 'pending', overallRating: '', ratingsJson: J([]), narrative: '', responseDue: day(30), contractorComment: '' },
    ],
  })
  await db.invoiceLog.createMany({
    data: [
      { contractId: c1.id, reference: 'INV-2025-014', period: 'Mar 2025', amountCents: cents(218400), status: 'paid' },
      { contractId: c1.id, reference: 'INV-2025-021', period: 'Apr 2025', amountCents: cents(221100), status: 'approved' },
      { contractId: c1.id, reference: 'INV-2025-029', period: 'May 2025', amountCents: cents(219700), status: 'submitted' },
    ],
  })
  await db.subcontractor.createMany({
    data: [
      { contractId: c1.id, name: 'Silverpine Analytics', valueCents: cents(760000), smallBusiness: true },
      { contractId: c1.id, name: 'Kestrel Engineering Group', valueCents: cents(320000), smallBusiness: true },
    ],
  })

  const c2 = await db.contract.create({
    data: {
      orgId: org.id, number: '47QRAA23D0087', vehicle: 'GSA MAS GS-35F-0456X', type: 'task_order',
      agency: 'General Services Administration', coName: 'Robert Tanaka (KO)', corName: 'Lisa Chen (COR)',
      status: 'active', awardDate: day(-700), startDate: day(-690), endDate: day(-40), popLabel: 'Base + 1 option',
      ceilingCents: cents(1850000), obligatedCents: cents(1720000), fundedCents: cents(1720000),
      closeoutJson: J([]),
    },
  })
  await db.deliverable.createMany({
    data: [
      { contractId: c2.id, title: 'Sprint Review Package', didRef: 'DI-ADMN-81339', frequency: 'Bi-weekly', nextDue: day(9), status: 'not_due', lastSubmitted: day(-5), recipients: 'COR' },
      { contractId: c2.id, title: 'Continuous Monitoring Report', didRef: 'DI-SAFT-80101', frequency: 'Monthly', nextDue: day(11), status: 'not_due', lastSubmitted: day(-20), recipients: 'ISSM' },
    ],
  })
  await db.modification.createMany({
    data: [
      { contractId: c2.id, number: 'P00001', type: 'pop_extension', effectiveDate: day(-70), valueDeltaCents: 0, description: 'Six-month period of performance extension for continuity of services.' },
    ],
  })
  await db.cparsEvaluation.create({
    data: { contractId: c2.id, periodLabel: 'FY2024', status: 'accepted', overallRating: 'Very Good', ratingsJson: J([{ factor: 'Quality', rating: 'Very Good' }, { factor: 'Schedule', rating: 'Exceptional' }, { factor: 'Cost Control', rating: 'Very Good' }, { factor: 'Management', rating: 'Very Good' }]), narrative: 'Consistent agile delivery with 27 production releases during the period. Minor invoicing delays were self-corrected.', responseDue: null, contractorComment: '' },
  })

  const c3 = await db.contract.create({
    data: {
      orgId: org.id, number: '75N98019D00042', vehicle: 'Direct award', type: 'prime',
      agency: 'National Institutes of Health', coName: 'Marta Oyelaran (KO)', corName: 'James Park (COR)',
      status: 'closed', awardDate: day(-1500), startDate: day(-1490), endDate: day(-130), popLabel: 'Base + 1 option',
      ceilingCents: cents(2200000), obligatedCents: cents(2200000), fundedCents: cents(2200000),
      closeoutJson: J([
        { label: 'Final invoice accepted', done: true },
        { label: 'Property and equipment disposition', done: true },
        { label: 'Final CPARS accepted', done: true },
        { label: 'Security closeout (ATO termination)', done: true },
        { label: 'Subcontractor closeout confirmations', done: true },
      ]),
      pastPerformanceAdded: true,
    },
  })

  // -----------------------------------------------------------------------
  // Library
  // -----------------------------------------------------------------------
  await db.pastPerformance.createMany({
    data: [
      {
        orgId: org.id, customer: 'Department of Veterans Affairs', contractNumber: '36C10X22D0031', title: 'Veteran Portal Experience Modernization',
        valueCents: cents(4300000), startDate: day(-900), endDate: day(-90), role: 'prime', naics: '541512', psc: 'D399',
        tagsJson: J(['web modernization', 'design system', '508 accessibility', 'agile delivery', 'health']),
        narrative: 'Re-architected the veteran portal experience across four product lines, introducing a WCAG 2.1 AA component library used by 11 downstream teams. Delivered 56 production releases over 24 months with a 99.94% availability record.',
        outcomes: 'Patient portal satisfaction up 18 points (A11y score 96); release cycle reduced from quarterly to bi-weekly; component adoption across 11 teams.',
        cparsRating: 'Exceptional', referenceName: 'Dr. Susan Yamada', referenceContact: 'susan.yamada@va.example', referencePermission: 'granted', status: 'approved',
      },
      {
        orgId: org.id, customer: 'U.S. Army Corps of Engineers ERDC', contractNumber: 'W912DZ24D0015', title: 'Geospatial Data Platform Services',
        valueCents: cents(8400000), startDate: day(-410), endDate: day(310), role: 'prime', naics: '541512', psc: 'R402',
        tagsJson: J(['geospatial', 'data platform', 'data pipelines', 'cloud migration']),
        narrative: 'Operating and enhancing the enterprise geospatial data platform: 14 ingestion pipelines, 99.5% interface availability, and a data model governance process adopted by the customer as a division standard.',
        outcomes: '14 pipelines migrated with zero data loss; data provisioning time reduced 71%; division-standard governance model.',
        cparsRating: 'Exceptional', referenceName: 'Dr. Alan Meyers', referenceContact: 'alan.meyers@erdc.example', referencePermission: 'granted', status: 'approved',
      },
      {
        orgId: org.id, customer: 'Department of Health and Human Services', contractNumber: '75N98019D00042', title: 'Clinical Research Data Platform',
        valueCents: cents(2200000), startDate: day(-1490), endDate: day(-130), role: 'prime', naics: '541511', psc: 'D399',
        tagsJson: J(['data engineering', 'health data', 'FHIR', 'data governance']),
        narrative: 'Built and operated the clinical research data platform supporting 2,400 studies: FHIR-based ingestion, cohort discovery APIs, and a governance framework aligned to CDISC standards.',
        outcomes: '2,400 studies supported; ingestion latency reduced from 48h to 90 minutes; CDISC-aligned governance adopted.',
        cparsRating: 'Very Good', referenceName: 'James Park', referenceContact: 'james.park@nih.example', referencePermission: 'granted', status: 'approved',
      },
      {
        orgId: org.id, customer: 'Internal Revenue Service', contractNumber: 'TIRNO-21-D-00103', title: 'Online Services Data Integration',
        valueCents: cents(3100000), startDate: day(-1300), endDate: day(-240), role: 'sub', naics: '518210', psc: 'D317',
        tagsJson: J(['data integration', 'ETL', 'dashboards', 'agile delivery']),
        narrative: 'As subcontractor, delivered the taxpayer-facing analytics ETL estate and executive dashboards for the online services division, including 38 automated data feeds and accessibility-compliant reporting.',
        outcomes: '38 automated feeds; dashboard adoption by 5 business units; zero missed SLA events in 22 months.',
        cparsRating: 'Exceptional', referenceName: 'Alicia Fontaine', referenceContact: 'alicia.fontaine@irs.example', referencePermission: 'granted', status: 'approved',
      },
    ],
  })

  await db.resume.createMany({
    data: [
      { orgId: org.id, name: 'Dana Whitfield', title: 'Program Manager (proposed)', lcat: 'Program Manager', clearance: 'Public Trust', certificationsJson: J(['PMP', 'SAFe Program Consultant', 'ITIL v4']), years: 16, availability: 'Available at award', summary: 'Led delivery of VA and HHS platforms totaling $15M; 16 years in federal digital services.', status: 'approved' },
      { orgId: org.id, name: 'Tom Becker', title: 'Solution Architect (proposed)', lcat: 'Solution Architect', clearance: 'None', certificationsJson: J(['AWS Solutions Architect Professional', 'CISSP']), years: 14, availability: 'Available at award', summary: 'Architecture lead for geospatial and health data platforms; continuous ATO practitioner.', status: 'approved' },
      { orgId: org.id, name: 'Renee Osei', title: 'DevSecOps Lead (proposed)', lcat: 'DevSecOps Engineer', clearance: 'None', certificationsJson: J(['Certified Kubernetes Administrator', 'CompTIA Security+']), years: 11, availability: 'Available at award', summary: 'Built CI/CD pipelines with 80%+ automated test coverage across three federal platforms.', status: 'approved' },
      { orgId: org.id, name: 'Victor Rios', title: 'Senior Data Engineer', lcat: 'Data Engineer (FHIR)', clearance: 'None', certificationsJson: J(['HL7 FHIR R4 Certified']), years: 9, availability: '30-day onboarding', summary: 'FHIR R4 interface specialist; built the NIH clinical data ingestion estate.', status: 'approved' },
      { orgId: org.id, name: 'Grace Lin', title: 'Human-Centered Design Lead', lcat: 'Human-Centered Design Lead', clearance: 'None', certificationsJson: J(['UXQB CPUX-F']), years: 10, availability: 'Available at award', summary: 'Design system lead on the VA portal modernization; raised A11y scores to 96.', status: 'approved' },
      { orgId: org.id, name: 'Andre Kowalski', title: 'QA / Test Lead', lcat: 'QA / Test Lead', clearance: 'None', certificationsJson: J(['ISTQB Advanced']), years: 12, availability: '15-day onboarding', summary: 'Automated test strategy lead; 80%+ coverage discipline across platforms.', status: 'draft' },
    ],
  })

  await db.libraryItem.createMany({
    data: [
      { orgId: org.id, category: 'boilerplate', title: 'Agile delivery methodology overview', content: 'Our agile delivery methodology is built around two-week sprints, trunk-based development, and definition-of-done gates that include automated testing above 80 percent coverage, accessibility verification, and security scanning. Sprint reviews are open to Government stakeholders, with recordings and minutes archived in the program knowledge base. Velocity is managed as an engineering discipline: teams sustain six or more production releases per quarter through pipeline automation, feature flags, and progressive delivery.', tagsJson: J(['agile', 'delivery', 'devsecops', 'velocity']), status: 'approved', owner: 'Marcus Lee', reviewBy: day(120), useCount: 14 },
      { orgId: org.id, category: 'boilerplate', title: 'WCAG 2.1 AA accessibility engineering practice', content: 'Accessibility is engineered into our component library rather than tested at the end. Every component ships with documented WCAG 2.1 AA conformance results, automated axe-core checks in the pipeline, and manual screen reader verification (NVDA, JAWS, VoiceOver) on each release candidate. On the VA portal modernization this practice produced a Lighthouse accessibility score of 96 across the top 50 pages.', tagsJson: J(['508', 'accessibility', 'wcag', 'component library']), status: 'approved', owner: 'Grace Lin', reviewBy: day(90), useCount: 11 },
      { orgId: org.id, category: 'boilerplate', title: 'Continuous ATO and security engineering approach', content: 'We implement continuous ATO by treating security documentation as code: control implementations are expressed as infrastructure and pipeline definitions, monitored through compliance-as-code scanning against the NIST SP 800-53 moderate baseline. Security authorization packages are generated automatically from the pipeline, reducing the ATO package preparation time from weeks to days. SAST, DAST, and dependency scanning gates run on every change.', tagsJson: J(['devsecops', 'ato', 'security', 'nist 800-53']), status: 'approved', owner: 'Renee Osei', reviewBy: day(150), useCount: 9 },
      { orgId: org.id, category: 'boilerplate', title: 'FHIR R4 health data integration practice', content: 'Our health data integration practice uses HL7 FHIR R4 APIs as the primary interface pattern, with data quality monitoring, interface availability targets of 99.5 percent, and automated alerting on interface failures. On the NIH clinical research data platform we built FHIR-based ingestion supporting 2,400 studies, reducing ingestion latency from 48 hours to 90 minutes while maintaining CDISC-aligned governance.', tagsJson: J(['fhir', 'health data', 'integration', 'data quality']), status: 'approved', owner: 'Victor Rios', reviewBy: day(60), useCount: 7 },
      { orgId: org.id, category: 'boilerplate', title: 'Transition-in and knowledge management framework', content: 'Our 60-day transition-in framework pairs incumbent knowledge capture with parallel operations: pipeline access and environments are established in week one, knowledge transfer sessions are scheduled by domain, and a go/no-go readiness gate is held at day 45 covering release pipeline continuity, security boundary readiness, and staffing certification. Knowledge management runs on a program wiki with community-of-practice sessions every sprint.', tagsJson: J(['transition', 'knowledge management', 'governance']), status: 'draft', owner: 'Marcus Lee', reviewBy: day(30), useCount: 2 },
      { orgId: org.id, category: 'boilerplate', title: 'Past performance citation template', content: 'Citation structure: customer, contract number, period of performance, role (prime/sub), relevance narrative linking scope, magnitude, and complexity to the current solicitation, quantified outcomes, and CPARS rating with reference permission status.', tagsJson: J(['past performance', 'template']), status: 'approved', owner: 'Dana Whitfield', reviewBy: day(200), useCount: 18 },
      { orgId: org.id, category: 'policy', title: 'CUI handling and document marking policy', content: 'Documents are marked at the document and section level. CUI-bearing documents are flagged in the document management system, excluded from AI processing unless explicitly permitted per document, and access-logged. Proprietary material is labeled and shared only under executed NDAs.', tagsJson: J(['cui', 'security', 'policy']), status: 'approved', owner: 'Elena Ruiz', reviewBy: day(180), useCount: 5 },
      { orgId: org.id, category: 'template', title: 'Risk register template (PWS-aligned)', content: 'Risk register fields: ID, description, likelihood (1-5), impact (1-5), mitigation, owner, review cadence, status. Aligned to monthly program review requirements in typical platform services PWS sections.', tagsJson: J(['risk', 'template', 'program management']), status: 'archived', owner: 'Marcus Lee', useCount: 3 },
    ],
  })

  // -----------------------------------------------------------------------
  // Integrations, notifications, tasks, audit
  // -----------------------------------------------------------------------
  await db.integration.createMany({
    data: [
      { orgId: org.id, key: 'sam_gov', name: 'SAM.gov Opportunities API', status: 'disabled', reason: 'API key required', detail: 'Add a SAM.gov API key in Settings to enable live opportunity sync. Manual entry, CSV import, and email-forward intake are available for any source.' },
      { orgId: org.id, key: 'usaspending', name: 'USAspending API', status: 'configured', reason: '', detail: 'Read-only market and award history queries. No key required.' },
      { orgId: org.id, key: 'gsa_calc', name: 'GSA CALC+ benchmarks', status: 'configured', reason: '', detail: 'Labor rate benchmark snapshot cached on ' + day(-9).toISOString().slice(0, 10) + '.' },
      { orgId: org.id, key: 'ai_assistant', name: 'Assistant (AI)', status: 'configured', reason: '', detail: 'Grounded drafting and record Q&A with citations. Drafts require human acceptance.' },
      { orgId: org.id, key: 'smtp', name: 'Email delivery (SMTP)', status: 'disabled', reason: 'Not configured', detail: 'In-app notifications are active. Configure SMTP to enable email delivery.' },
      { orgId: org.id, key: 'm365', name: 'Microsoft 365 / SharePoint', status: 'disabled', reason: 'Not configured', detail: 'Optional connector for document round-tripping through Microsoft Graph.' },
    ],
  })

  await db.notification.createMany({
    data: [
      { orgId: org.id, userId: propMgr.id, kind: 'deadline', title: 'Proposal due in 18 days', body: 'VHA Digital Health Platform Modernization (36C25X25Q0187) is due soon. Compliance coverage is at 71 percent.', recordType: 'proposal', recordId: prop5.id },
      { orgId: org.id, userId: propMgr.id, kind: 'review', title: 'Red Team review scheduled', body: 'Red Team review for the VHA Digital Health Platform proposal is scheduled. Scorecards will be prepared against Section M factors.', recordType: 'proposal', recordId: prop5.id },
      { orgId: org.id, userId: capture.id, kind: 'deadline', title: 'Bid decision due', body: 'Army Logistics Data Integration pursuit is at the bid decision gate. Scorecard awaiting completion.', recordType: 'pursuit', recordId: p4.id },
      { orgId: org.id, userId: contracts.id, kind: 'option', title: 'Option exercise window opening', body: 'W912DZ24D0015 Option Period 1 must be exercised in 45 days. Preliminary notice is due in 15 days.', recordType: 'contract', recordId: c1.id },
      { orgId: org.id, userId: contracts.id, kind: 'cpars', title: 'CPARS response window open', body: 'FY2025 CPARS evaluation for W912DZ24D0015 is pending. Contractor response is due in 30 days.', recordType: 'contract', recordId: c1.id },
      { orgId: org.id, userId: capture.id, kind: 'match', title: 'New opportunity match (87)', body: 'VHA Digital Health Platform Modernization scored 87 against your profile: NAICS match, set-aside eligibility, and two relevant past performances.', recordType: 'opportunity', recordId: o1.id },
      { orgId: org.id, userId: owner.id, kind: 'system', title: 'SAM registration expires in 214 days', body: 'Your SAM.gov registration expires this year. Renewal requires action at least 45 days before expiry.', recordType: 'settings', recordId: '' },
      { orgId: org.id, userId: owner.id, kind: 'review', title: 'Library item awaiting approval', body: 'Transition-in and knowledge management framework is in draft. Approve it in the Library before the Red Team review so it can ground drafting.', recordType: 'library', recordId: '' },
      { orgId: org.id, userId: owner.id, kind: 'assignment', title: 'Gate decision recorded on VHA pursuit', body: 'Marcus Lee recorded a Bid decision on VHA Digital Health Platform Modernization. Review the scorecard in Pipeline.', recordType: 'pursuit', recordId: p5.id },
    ],
  })

  await db.task.createMany({
    data: [
      { orgId: org.id, title: 'Complete Section M compliance mapping', detail: 'Map the 12 remaining extracted requirements to outline sections.', assigneeId: propMgr.id, dueDate: day(3), status: 'open', priority: 'high', recordType: 'proposal', recordId: prop5.id, recordLabel: 'VHA Digital Health Platform' },
      { orgId: org.id, title: 'Draft Section 4 — Security and Compliance Engineering', detail: 'DevSecOps pipeline and continuous ATO narrative with library citations.', assigneeId: sme.id, dueDate: day(6), status: 'open', priority: 'high', recordType: 'proposal', recordId: prop5.id, recordLabel: 'VHA Digital Health Platform' },
      { orgId: org.id, title: 'Complete bid decision scorecard', detail: 'Army Logistics Data Integration is at the gate. Six criteria to score.', assigneeId: capture.id, dueDate: day(5), status: 'open', priority: 'high', recordType: 'pursuit', recordId: p4.id, recordLabel: 'Army Logistics Data Integration' },
      { orgId: org.id, title: 'Submit Configuration Management Plan revision', detail: 'CDRL deliverable is 3 days late on W912DZ24D0015.', assigneeId: contracts.id, dueDate: day(-3), status: 'open', priority: 'high', recordType: 'contract', recordId: c1.id, recordLabel: 'W912DZ24D0015' },
      { orgId: org.id, title: 'File CPARS contractor response', detail: 'FY2025 CPARS response window closes in 30 days.', assigneeId: contracts.id, dueDate: day(30), status: 'open', priority: 'medium', recordType: 'contract', recordId: c1.id, recordLabel: 'W912DZ24D0015' },
      { orgId: org.id, title: 'Approve transition-in boilerplate', detail: 'Transition framework item is in draft; approve before Red Team.', assigneeId: owner.id, dueDate: day(10), status: 'open', priority: 'medium', recordType: 'library', recordId: '', recordLabel: 'Library' },
      { orgId: org.id, title: 'Review pricing model sensitivity', detail: 'Confirm fee and escalation scenarios before price volume freeze.', assigneeId: pricing.id, dueDate: day(8), status: 'open', priority: 'medium', recordType: 'pricing', recordId: model.id, recordLabel: 'VHA cost model' },
      { orgId: org.id, title: 'Send option exercise preliminary notice', detail: 'Preliminary notice for Option Period 1 is due in 15 days.', assigneeId: contracts.id, dueDate: day(15), status: 'open', priority: 'medium', recordType: 'contract', recordId: c1.id, recordLabel: 'W912DZ24D0015' },
    ],
  })

  await db.auditLog.createMany({
    data: [
      { orgId: org.id, userName: 'Marcus Lee', userRole: 'Capture Manager', action: 'pursuit.gate_approved', entity: 'pursuit', entityId: p5.id, entityLabel: 'VHA Digital Health Platform Modernization', detail: 'Bid decision approved by Dana Whitfield (score 4.5/5.0).', createdAt: day(-14) },
      { orgId: org.id, userName: 'Priya Nair', userRole: 'Proposal Manager', action: 'proposal.intake_completed', entity: 'proposal', entityId: prop5.id, entityLabel: 'VHA Digital Health Platform', detail: 'Solicitation 36C25X25Q0187 processed: 40 requirements extracted across 5 source documents.', createdAt: day(-13) },
      { orgId: org.id, userName: 'Priya Nair', userRole: 'Proposal Manager', action: 'review.completed', entity: 'proposal', entityId: prop5.id, entityLabel: 'VHA Digital Health Platform', detail: 'Blue Team review complete: 4 findings (2 accepted, 1 deferred, 1 open).', createdAt: day(-5) },
      { orgId: org.id, userName: 'Sam Ortiz', userRole: 'Pricing Analyst', action: 'pricing.model_created', entity: 'pricing_model', entityId: model.id, entityLabel: 'VHA cost model', detail: 'Cost model created with FY2025 provisional rates and 3.0 percent escalation.', createdAt: day(-12) },
      { orgId: org.id, userName: 'Elena Ruiz', userRole: 'Contracts Manager', action: 'contract.modification_recorded', entity: 'contract', entityId: c1.id, entityLabel: 'W912DZ24D0015', detail: 'P00002 funding modification recorded (+$600,000).', createdAt: day(-95) },
    ],
  })

  // -----------------------------------------------------------------------

  console.log('Seed complete: BidDesk demonstration workspace created.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
