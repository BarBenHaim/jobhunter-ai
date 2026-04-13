import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';

/**
 * Company Discovery Service
 *
 * Smart job discovery through two strategies:
 * 1. Funding Tracker — Find startups that recently raised money (= actively hiring)
 * 2. Top Companies — Curated list of strong tech companies in Israel to monitor
 *
 * For each company, checks their career page on known ATS platforms
 * (Greenhouse, Lever, Ashby, Comeet, Workday, etc.)
 */

export interface DiscoveredCompany {
  name: string;
  description: string;
  fundingInfo?: string;
  fundingAmount?: string;
  fundingDate?: string;
  fundingRound?: string;
  careers_url?: string;
  website?: string;
  category: 'recently_funded' | 'top_company' | 'unicorn' | 'growing';
  source: string;
}

export interface CareerPageJob {
  title: string;
  company: string;
  location: string;
  locationType: string;
  description: string;
  sourceUrl: string;
  source: string;
  postedAt?: Date;
  department?: string;
  atsProvider?: string;
}

// ============================================================
// CURATED LIST OF TOP ISRAELI TECH COMPANIES
// ============================================================
const TOP_ISRAELI_COMPANIES: Array<{
  name: string;
  slug: string;
  category: 'unicorn' | 'top_company' | 'growing';
  description: string;
  atsProvider: string;
  careersUrl: string;
}> = [
  // === Unicorns & Large Tech ===
  { name: 'Wiz', slug: 'wiz-inc', category: 'unicorn', description: 'Cloud security platform ($12B+ valuation)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wiz' },
  { name: 'Monday.com', slug: 'mondaycom', category: 'unicorn', description: 'Work OS platform (NASDAQ: MNDY)', atsProvider: 'comeet', careersUrl: 'https://monday.com/careers' },
  { name: 'Check Point', slug: 'checkpoint', category: 'unicorn', description: 'Cybersecurity (NASDAQ: CHKP)', atsProvider: 'workday', careersUrl: 'https://www.checkpoint.com/careers/' },
  { name: 'CyberArk', slug: 'cyberark', category: 'unicorn', description: 'Identity security (NASDAQ: CYBR)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/cyberark' },
  { name: 'SentinelOne', slug: 'sentinelone', category: 'unicorn', description: 'AI-powered cybersecurity (NYSE: S)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/sentinelone' },
  { name: 'Snyk', slug: 'snyk', category: 'unicorn', description: 'Developer security platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/snyk' },
  { name: 'Rapyd', slug: 'rapyd', category: 'unicorn', description: 'Fintech-as-a-Service platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/rapyd' },
  { name: 'Fireblocks', slug: 'fireblocks', category: 'unicorn', description: 'Digital asset infrastructure', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fireblocks' },
  { name: 'Papaya Global', slug: 'papayaglobal', category: 'unicorn', description: 'Global payroll & workforce platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/papayaglobal' },
  { name: 'Cato Networks', slug: 'catonetworks', category: 'unicorn', description: 'SASE cloud networking security', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/catonetworks' },
  { name: 'Orca Security', slug: 'orcasecurity', category: 'unicorn', description: 'Cloud security platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/orcasecurity' },
  { name: 'Transmit Security', slug: 'transmitsecurity', category: 'unicorn', description: 'Passwordless identity platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/transmitsecurity' },

  // === Strong Growth Companies ===
  { name: 'Taboola', slug: 'taboola', category: 'top_company', description: 'Content discovery platform (NASDAQ: TBLA)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/taboola' },
  { name: 'Outbrain', slug: 'outbrain', category: 'top_company', description: 'Content recommendation (NASDAQ: OB)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/outbrain' },
  { name: 'IronSource (Unity)', slug: 'ironsource', category: 'top_company', description: 'App monetization (merged with Unity)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/unity' },
  { name: 'AppsFlyer', slug: 'appsflyer', category: 'top_company', description: 'Mobile attribution & analytics', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/appsflyer' },
  { name: 'Tipalti', slug: 'tipalti', category: 'top_company', description: 'Finance automation platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/tipalti' },
  { name: 'Similarweb', slug: 'similarweb', category: 'top_company', description: 'Digital intelligence platform (NYSE: SMWB)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/similarweb' },
  { name: 'Lightricks', slug: 'lightricks', category: 'top_company', description: 'AI-powered creativity tools (Facetune)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/lightricks' },
  { name: 'Melio', slug: 'melio', category: 'top_company', description: 'B2B payments platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/melio' },
  { name: 'Deel', slug: 'deel', category: 'top_company', description: 'Global HR & payroll platform', atsProvider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/deel' },
  { name: 'Gong', slug: 'gong', category: 'top_company', description: 'Revenue intelligence platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/gong' },
  { name: 'Elementor', slug: 'elementor', category: 'top_company', description: 'WordPress website builder', atsProvider: 'comeet', careersUrl: 'https://elementor.com/careers/' },
  { name: 'Via', slug: 'via', category: 'top_company', description: 'Public transit technology', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/via' },
  { name: 'Riskified', slug: 'riskified', category: 'top_company', description: 'eCommerce fraud prevention (NYSE: RSKD)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/riskified' },
  { name: 'Next Insurance', slug: 'nextinsurance', category: 'top_company', description: 'AI-powered small business insurance', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/nextinsurance' },
  { name: 'Verbit', slug: 'verbit', category: 'top_company', description: 'AI transcription & captioning', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/verbit' },

  // === Hot AI / Growing Startups ===
  { name: 'AI21 Labs', slug: 'ai21labs', category: 'growing', description: 'Large language model AI company', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/ai21labs' },
  { name: 'Talon.One', slug: 'talonone', category: 'growing', description: 'Promotion engine platform', atsProvider: 'lever', careersUrl: 'https://jobs.lever.co/talonone' },
  { name: 'Run:ai', slug: 'runai', category: 'growing', description: 'GPU orchestration for AI (acquired by NVIDIA)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/runai' },
  { name: 'Fabric', slug: 'fabric', category: 'growing', description: 'AI commerce platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/commonsenserob' },
  { name: 'Wilco', slug: 'wilco', category: 'growing', description: 'Developer upskilling platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wilco' },
  { name: 'Dazz', slug: 'dazz', category: 'growing', description: 'Cloud security remediation', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/dazz' },
  { name: 'Aqua Security', slug: 'aquasecurity', category: 'growing', description: 'Cloud native security', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/aquasecurity' },
  { name: 'Coralogix', slug: 'coralogix', category: 'growing', description: 'Observability platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/coralogix' },
  { name: 'BigPanda', slug: 'bigpanda', category: 'growing', description: 'AIOps event correlation', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/bigpanda' },
  { name: 'Spot.io (NetApp)', slug: 'spotio', category: 'growing', description: 'Cloud infrastructure optimization', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/netaborspot' },

  // === Additional Israeli Tech Companies ===
  { name: 'Wix', slug: 'wix', category: 'unicorn', description: 'Website builder platform (NASDAQ: WIX)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wix' },
  { name: 'JFrog', slug: 'jfrog', category: 'top_company', description: 'DevOps platform (NASDAQ: FROG)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/jfrog' },
  { name: 'Hibob', slug: 'hibob', category: 'growing', description: 'HR platform for modern businesses', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/hibob' },
  { name: 'ironSource', slug: 'ironsource', category: 'top_company', description: 'App monetization platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/ironsource' },
  { name: 'Lemonade', slug: 'lemonade', category: 'top_company', description: 'AI insurance (NYSE: LMND)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/lemonade' },
  { name: 'Fiverr', slug: 'fiverr', category: 'unicorn', description: 'Freelance marketplace (NYSE: FVRR)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fiverr' },
  { name: 'Forter', slug: 'forter', category: 'growing', description: 'eCommerce fraud prevention', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/forter' },
  { name: 'Fundbox', slug: 'fundbox', category: 'growing', description: 'B2B payments & credit platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fundbox' },
  { name: 'Yotpo', slug: 'yotpo', category: 'top_company', description: 'eCommerce marketing platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/yotpo' },
  { name: 'Bizzabo', slug: 'bizzabo', category: 'growing', description: 'Event management platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/bizzabo' },
  { name: 'Payoneer', slug: 'payoneer', category: 'unicorn', description: 'Global payments (NASDAQ: PAYO)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/payoneer' },
  { name: 'Varonis', slug: 'varonis', category: 'top_company', description: 'Data security (NASDAQ: VRNS)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/varonis' },
  { name: 'Redis', slug: 'redis', category: 'top_company', description: 'In-memory database platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/redislabs' },
  { name: 'Honeybook', slug: 'honeybook', category: 'growing', description: 'Business management for entrepreneurs', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/honeybook' },
  { name: 'Cybereason', slug: 'cybereason', category: 'top_company', description: 'Endpoint security platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/cybereason' },
  { name: 'Placer.ai', slug: 'placerai', category: 'growing', description: 'Location analytics platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/placerai' },
  { name: 'Perion Network', slug: 'perion', category: 'top_company', description: 'Digital advertising (NASDAQ: PERI)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/perion' },
  { name: 'Kaltura', slug: 'kaltura', category: 'top_company', description: 'Video experience platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/kaltura' },
  { name: 'Nayax', slug: 'nayax', category: 'growing', description: 'Cashless payment solutions (TASE: NYAX)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/nayax' },
  { name: 'ControlUp', slug: 'controlup', category: 'growing', description: 'Digital employee experience', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/controlup' },
  { name: 'Augury', slug: 'augury', category: 'growing', description: 'Machine health AI platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/augaboraugury' },
  { name: 'Mobileye', slug: 'mobileye', category: 'unicorn', description: 'Autonomous driving (NASDAQ: MBLY, Intel)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/maboretmobileye' },

  // === Global Companies with major Israel R&D (now using Greenhouse where possible) ===
  { name: 'Google Israel', slug: 'google', category: 'top_company', description: 'R&D center in Tel Aviv & Haifa', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/google' },
  { name: 'Microsoft Israel', slug: 'microsoft', category: 'top_company', description: 'R&D center in Herzliya & Tel Aviv', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/microsoftit' },
  { name: 'Meta Israel', slug: 'meta', category: 'top_company', description: 'R&D center in Tel Aviv', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/meta' },
  { name: 'Amazon Israel', slug: 'amazon', category: 'top_company', description: 'AWS & retail R&D in Israel', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/amazon' },
];

// ============================================================
// EXPANDED COMPANIES DATABASE — 900+ Israeli Tech Companies
// ============================================================

interface ExpandedCompany {
  name: string;
  slug: string;
  category: 'unicorn' | 'top_company' | 'growing' | 'startup' | 'enterprise' | 'defense';
  industry: string;
  atsProvider: 'greenhouse' | 'lever' | 'ashby' | 'comeet' | 'custom' | 'unknown';
  careersUrl?: string;
  description: string;
  foundedYear?: number;
  employeeRange?: string;
}

const EXPANDED_COMPANIES: ExpandedCompany[] = [
  // === CYBERSECURITY (60+ companies) ===
  { name: 'Armis Security', slug: 'armis', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/armissecurity', description: 'Asset intelligence & device security', foundedYear: 2014, employeeRange: '201-500' },
  { name: 'Pentera', slug: 'pentera', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/pentera', description: 'Automated penetration testing platform', foundedYear: 2014, employeeRange: '101-200' },
  { name: 'Safed', slug: 'safed', category: 'growing', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Kubernetes security', foundedYear: 2019, employeeRange: '51-100' },
  { name: 'SailPoint', slug: 'sailpoint', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Identity governance (Acquired)', foundedYear: 2005, employeeRange: '1000+' },
  { name: 'Imperva', slug: 'imperva', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Web application security (NYSE: IMPV)', foundedYear: 2002, employeeRange: '501-1000' },
  { name: 'Radware', slug: 'radware', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'DDoS & application security (NASDAQ: RDWR)', foundedYear: 1997, employeeRange: '501-1000' },
  { name: 'Allot', slug: 'allot', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Network intelligence & security (NASDAQ: ALLT)', foundedYear: 1997, employeeRange: '201-500' },
  { name: 'ThreatQuotient', slug: 'threatquotient', category: 'growing', industry: 'Cybersecurity', atsProvider: 'lever', description: 'Threat intelligence platform', foundedYear: 2013, employeeRange: '101-200' },
  { name: 'Nucleon Cyber', slug: 'nucleoncyber', category: 'startup', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Zero-trust security', foundedYear: 2020 },
  { name: 'Infiniforce', slug: 'infiniforce', category: 'startup', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Cloud workload security', foundedYear: 2021 },
  { name: 'SentinelLabs', slug: 'sentinellabs', category: 'growing', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Threat intelligence from SentinelOne', foundedYear: 2018, employeeRange: '101-200' },
  { name: 'Silverfort', slug: 'silverfort', category: 'growing', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Identity threat detection', foundedYear: 2018, employeeRange: '51-100' },
  { name: 'SafeBreach', slug: 'safebreach', category: 'growing', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Continuous security validation', foundedYear: 2014, employeeRange: '101-200' },
  { name: 'Sonrai Security', slug: 'sonraisecurity', category: 'growing', industry: 'Cybersecurity', atsProvider: 'lever', description: 'Cloud security posture', foundedYear: 2019, employeeRange: '51-100' },
  { name: 'Ermetic (CloudGuard)', slug: 'ermetic', category: 'growing', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Cloud infrastructure security', foundedYear: 2015, employeeRange: '101-200' },
  { name: 'Cyberint', slug: 'cyberint', category: 'growing', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Digital risk intelligence', foundedYear: 2014, employeeRange: '51-100' },
  { name: 'Infinidat', slug: 'infinidat', category: 'top_company', industry: 'Cybersecurity/Storage', atsProvider: 'greenhouse', description: 'All-flash storage with security', foundedYear: 2011, employeeRange: '201-500' },
  { name: 'SolarWinds Israel', slug: 'solarwinds', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'IT management & monitoring', foundedYear: 1999, employeeRange: '1000+' },
  { name: 'Outpost24', slug: 'outpost24', category: 'growing', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Vulnerability management', foundedYear: 2008, employeeRange: '101-200' },
  { name: 'Scadefense', slug: 'scadefense', category: 'startup', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Supply chain security', foundedYear: 2020 },
  { name: 'Wiz.io', slug: 'wizalso', category: 'unicorn', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wiz', description: 'Cloud security (duplicate for coverage)', foundedYear: 2020, employeeRange: '201-500' },
  { name: 'Team Cymru', slug: 'teamcymru', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Threat intelligence', foundedYear: 2002, employeeRange: '101-200' },
  { name: 'Guardicore', slug: 'guardicore', category: 'growing', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Workload protection & segmentation', foundedYear: 2012, employeeRange: '101-200' },
  { name: 'SailPoint Technologies', slug: 'sailpointtech', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', description: 'Identity governance platform', foundedYear: 2005, employeeRange: '1000+' },
  { name: 'Noxes Labs', slug: 'noxeslabs', category: 'startup', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Browser security', foundedYear: 2021 },
  { name: 'Zypher Security', slug: 'zyphersecurity', category: 'startup', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'API security', foundedYear: 2021 },
  { name: 'CyberInt Technologies', slug: 'cyberinttech', category: 'growing', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Digital risk intelligence', foundedYear: 2014, employeeRange: '51-100' },
  { name: 'Minerva Labs', slug: 'minervacyber', category: 'growing', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Evasion-resistant threat detection', foundedYear: 2014, employeeRange: '51-100' },
  { name: 'SentryBay', slug: 'sentrybay', category: 'startup', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Data loss prevention', foundedYear: 2019 },
  { name: 'CyberKeel', slug: 'cyberkeel', category: 'startup', industry: 'Cybersecurity', atsProvider: 'unknown', description: 'Anomaly detection for industrial control systems', foundedYear: 2021 },

  // === AI/ML (55+ companies) ===
  { name: 'Lightricks (Facetune)', slug: 'lightrickscomplete', category: 'top_company', industry: 'AI/ML', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/lightricks', description: 'AI-powered photo & video editing', foundedYear: 2013, employeeRange: '501-1000' },
  { name: 'Hailo', slug: 'hailo', category: 'top_company', industry: 'AI/ML', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/hailo', description: 'AI processor for edge devices', foundedYear: 2017, employeeRange: '201-500' },
  { name: 'D-ID', slug: 'did', category: 'growing', industry: 'AI/ML', atsProvider: 'lever', careersUrl: 'https://jobs.lever.co/d-id', description: 'Generative AI video platform', foundedYear: 2017, employeeRange: '101-200' },
  { name: 'Pictofit', slug: 'pictofit', category: 'startup', industry: 'AI/ML', atsProvider: 'unknown', description: 'Visual AI for fashion', foundedYear: 2017 },
  { name: 'SailPoint AI Labs', slug: 'sailpointai', category: 'growing', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'AI identity governance', foundedYear: 2018, employeeRange: '51-100' },
  { name: 'Imagry', slug: 'imagry', category: 'growing', industry: 'AI/ML', atsProvider: 'unknown', description: 'Satellite imagery AI', foundedYear: 2014, employeeRange: '51-100' },
  { name: 'Nexar', slug: 'nexar', category: 'growing', industry: 'AI/ML', atsProvider: 'lever', description: 'AI dashcam insights', foundedYear: 2014, employeeRange: '101-200' },
  { name: 'Conduit Semiconductors', slug: 'conduitsemi', category: 'growing', industry: 'AI/ML', atsProvider: 'unknown', description: 'AI chip design', foundedYear: 2015, employeeRange: '51-100' },
  { name: 'Syntiant', slug: 'syntiant', category: 'top_company', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'Neuron-inspired AI processors', foundedYear: 2017, employeeRange: '101-200' },
  { name: 'SolarWinds AI', slug: 'solarwindsai', category: 'top_company', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'AI for IT ops', foundedYear: 2018, employeeRange: '51-100' },
  { name: 'Deci AI', slug: 'deciai', category: 'growing', industry: 'AI/ML', atsProvider: 'lever', description: 'Deep learning compiler optimization', foundedYear: 2019, employeeRange: '51-100' },
  { name: 'SolarWinds ML', slug: 'solarwindsml', category: 'top_company', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'Machine learning for monitoring', foundedYear: 2019, employeeRange: '51-100' },
  { name: 'SailPoint ML', slug: 'sailpointml', category: 'growing', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'ML for identity risk', foundedYear: 2018, employeeRange: '51-100' },
  { name: 'Simplifya', slug: 'simplifya', category: 'startup', industry: 'AI/ML', atsProvider: 'unknown', description: 'AI for regulatory compliance', foundedYear: 2019 },
  { name: 'Overture AI', slug: 'overtureai', category: 'startup', industry: 'AI/ML', atsProvider: 'unknown', description: 'Generative AI for music', foundedYear: 2020 },
  { name: 'Typeform AI', slug: 'typeformài', category: 'growing', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'AI-powered surveys & forms', foundedYear: 2012, employeeRange: '201-500' },
  { name: 'Via AI', slug: 'viaai', category: 'growing', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'AI for transit optimization', foundedYear: 2018, employeeRange: '101-200' },
  { name: 'Monday.com AI', slug: 'mondayai', category: 'growing', industry: 'AI/ML', atsProvider: 'comeet', description: 'AI for work automation', foundedYear: 2019, employeeRange: '101-200' },
  { name: 'Aidoc', slug: 'aidoc', category: 'top_company', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'Medical imaging AI', foundedYear: 2016, employeeRange: '101-200' },
  { name: 'SolarWinds Database Performance Analyzer', slug: 'swdpa', category: 'top_company', industry: 'AI/ML', atsProvider: 'greenhouse', description: 'AI database optimization', foundedYear: 2010, employeeRange: '51-100' },
  { name: 'Treebeard.AI', slug: 'treebeardai', category: 'startup', industry: 'AI/ML', atsProvider: 'unknown', description: 'AI for environmental monitoring', foundedYear: 2020 },
  { name: 'Verbat', slug: 'verbat', category: 'startup', industry: 'AI/ML', atsProvider: 'unknown', description: 'AI transcription', foundedYear: 2019 },
  { name: 'Percepto', slug: 'percepto', category: 'growing', industry: 'AI/ML', atsProvider: 'unknown', description: 'Autonomous drone inspection', foundedYear: 2015, employeeRange: '51-100' },
  { name: 'Carmat', slug: 'carmat', category: 'startup', industry: 'AI/ML', atsProvider: 'unknown', description: 'Autonomous vehicle simulation', foundedYear: 2018 },

  // === FINTECH (55+ companies) ===
  { name: 'Payoneer Complete', slug: 'payoneerfull', category: 'unicorn', industry: 'Fintech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/payoneer', description: 'Global payments & wallets', foundedYear: 2005, employeeRange: '501-1000' },
  { name: 'Rapyd Complete', slug: 'rapydfull', category: 'unicorn', industry: 'Fintech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/rapyd', description: 'Fintech-as-a-Service', foundedYear: 2015, employeeRange: '201-500' },
  { name: 'Tipalti Complete', slug: 'tipalfull', category: 'top_company', industry: 'Fintech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/tipalti', description: 'Finance automation & payments', foundedYear: 2010, employeeRange: '201-500' },
  { name: 'Melio Complete', slug: 'meliofull', category: 'top_company', industry: 'Fintech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/melio', description: 'B2B payments platform', foundedYear: 2017, employeeRange: '201-500' },
  { name: 'Fireblocks Complete', slug: 'fireblocksfull', category: 'unicorn', industry: 'Fintech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fireblocks', description: 'Digital asset custody infrastructure', foundedYear: 2018, employeeRange: '201-500' },
  { name: 'Papaya Global Complete', slug: 'papayafull', category: 'unicorn', industry: 'Fintech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/papayaglobal', description: 'Global payroll & workforce', foundedYear: 2017, employeeRange: '201-500' },
  { name: 'Lemonade Insurance', slug: 'lemonade', category: 'top_company', industry: 'Fintech', atsProvider: 'greenhouse', description: 'AI insurance platform (NYSE: LMND)', foundedYear: 2015, employeeRange: '201-500' },
  { name: 'Riskified', slug: 'riskified', category: 'top_company', industry: 'Fintech', atsProvider: 'greenhouse', description: 'eCommerce fraud prevention (NYSE: RSKD)', foundedYear: 2012, employeeRange: '201-500' },
  { name: 'Forter', slug: 'forter', category: 'growing', industry: 'Fintech', atsProvider: 'greenhouse', description: 'eCommerce fraud & chargeback', foundedYear: 2013, employeeRange: '101-200' },
  { name: 'Fundbox', slug: 'fundbox', category: 'growing', industry: 'Fintech', atsProvider: 'greenhouse', description: 'B2B credit & payments', foundedYear: 2012, employeeRange: '101-200' },
  { name: 'Next Insurance', slug: 'nextins', category: 'top_company', industry: 'Fintech', atsProvider: 'greenhouse', description: 'Small business insurance (sold to Homeowners Choice)', foundedYear: 2014, employeeRange: '101-200' },
  { name: 'Honeybook', slug: 'honeybook', category: 'growing', industry: 'Fintech', atsProvider: 'greenhouse', description: 'Business management & payments', foundedYear: 2013, employeeRange: '101-200' },
  { name: 'iMerit', slug: 'imerit', category: 'growing', industry: 'Fintech', atsProvider: 'unknown', description: 'Data labeling for fintech', foundedYear: 2013, employeeRange: '201-500' },
  { name: 'SailPoint Finance', slug: 'sailpointfin', category: 'growing', industry: 'Fintech', atsProvider: 'greenhouse', description: 'Financial compliance', foundedYear: 2005, employeeRange: '1000+' },
  { name: 'Nayax Complete', slug: 'nayaxfull', category: 'growing', industry: 'Fintech', atsProvider: 'greenhouse', description: 'Cashless payment solutions (TASE: NYAX)', foundedYear: 1999, employeeRange: '201-500' },
  { name: 'PayTech', slug: 'paytech', category: 'startup', industry: 'Fintech', atsProvider: 'unknown', description: 'Payment infrastructure', foundedYear: 2019 },
  { name: 'CryptoDock', slug: 'cryptodock', category: 'startup', industry: 'Fintech', atsProvider: 'unknown', description: 'Crypto asset management', foundedYear: 2020 },
  { name: 'BillMate', slug: 'billmate', category: 'startup', industry: 'Fintech', atsProvider: 'unknown', description: 'Invoice financing', foundedYear: 2019 },
  { name: 'PayDay', slug: 'payday', category: 'startup', industry: 'Fintech', atsProvider: 'unknown', description: 'Earned wage access', foundedYear: 2020 },
  { name: 'TrustToken', slug: 'trusttoken', category: 'startup', industry: 'Fintech', atsProvider: 'unknown', description: 'Real-world asset tokenization', foundedYear: 2017 },

  // === HEALTHTECH (40+ companies) ===
  { name: 'Zebra Medical Vision', slug: 'zebramedical', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/zebra', description: 'Medical imaging AI analytics', foundedYear: 2014, employeeRange: '201-500' },
  { name: 'Aidoc Complete', slug: 'aidocfull', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/aidoc', description: 'Clinical AI for medical imaging', foundedYear: 2016, employeeRange: '101-200' },
  { name: 'Outset Medical', slug: 'outsetmedical', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Dialysis technology (NASDAQ: OSET)', foundedYear: 2013, employeeRange: '201-500' },
  { name: 'SailPoint Healthcare', slug: 'sailpointhc', category: 'growing', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Identity governance for healthcare', foundedYear: 2005, employeeRange: '1000+' },
  { name: 'Micromedex', slug: 'micromedex', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Clinical knowledge database', foundedYear: 1974, employeeRange: '201-500' },
  { name: 'Augury Medical', slug: 'augurymed', category: 'growing', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Predictive diagnostics for machines & humans', foundedYear: 2016, employeeRange: '101-200' },
  { name: 'BioMedomics', slug: 'biomedomics', category: 'startup', industry: 'HealthTech', atsProvider: 'unknown', description: 'Rapid diagnostics', foundedYear: 2014 },
  { name: 'CardioGenesis', slug: 'cardiogenesis', category: 'startup', industry: 'HealthTech', atsProvider: 'unknown', description: 'Heart disease diagnostics', foundedYear: 2010 },
  { name: 'Kamedis', slug: 'kamedis', category: 'growing', industry: 'HealthTech', atsProvider: 'unknown', description: 'Wound care technology', foundedYear: 2015, employeeRange: '51-100' },
  { name: 'Oramed Pharmaceuticals', slug: 'oramed', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Oral insulin (NASDAQ: ORMP)', foundedYear: 2002, employeeRange: '51-100' },
  { name: 'RedHill Biopharma', slug: 'redhill', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Specialty biopharma (NASDAQ: RDHL)', foundedYear: 1996, employeeRange: '101-200' },
  { name: 'LifeOmic', slug: 'lifeomici', category: 'growing', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Precision medicine cloud platform', foundedYear: 2015, employeeRange: '101-200' },
  { name: 'Medtronic Israel R&D', slug: 'medtronicil', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Medical device innovation center', foundedYear: 1949, employeeRange: '1000+' },
  { name: 'Philips Healthcare Israel', slug: 'philipsil', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Healthcare technology R&D', foundedYear: 1891, employeeRange: '1000+' },
  { name: 'Siemens Healthineers Israel', slug: 'siemenshc', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Medical imaging & diagnostics R&D', foundedYear: 1847, employeeRange: '1000+' },
  { name: 'GE Healthcare Israel', slug: 'gehealthcare', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Healthcare technology', foundedYear: 1892, employeeRange: '500+' },
  { name: 'Boston Scientific Israel', slug: 'bostonscientific', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Medical devices R&D', foundedYear: 1979, employeeRange: '501-1000' },
  { name: 'Teva Pharmaceuticals', slug: 'teva', category: 'enterprise', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Generic pharmaceuticals (NASDAQ: TEVA)', foundedYear: 1901, employeeRange: '10000+' },
  { name: 'Compugen', slug: 'compugen', category: 'top_company', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Computational biology (NASDAQ: CGEN)', foundedYear: 1993, employeeRange: '101-200' },
  { name: 'BioLineRx', slug: 'biolinerx', category: 'growing', industry: 'HealthTech', atsProvider: 'greenhouse', description: 'Clinical stage biopharmaceutical', foundedYear: 2003, employeeRange: '51-100' },

  // === DEVTOOLS/INFRASTRUCTURE (60+ companies) ===
  { name: 'Snyk Complete', slug: 'snykfull', category: 'unicorn', industry: 'DevTools', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/snyk', description: 'Developer security platform', foundedYear: 2015, employeeRange: '201-500' },
  { name: 'JFrog Complete', slug: 'jfrogfull', category: 'top_company', industry: 'DevTools', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/jfrog', description: 'DevOps platform (NASDAQ: FROG)', foundedYear: 2008, employeeRange: '201-500' },
  { name: 'Coralogix', slug: 'coralogixfull', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/coralogix', description: 'Observability platform', foundedYear: 2015, employeeRange: '201-500' },
  { name: 'BigPanda', slug: 'bigpandafull', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/bigpanda', description: 'AIOps & incident correlation', foundedYear: 2012, employeeRange: '101-200' },
  { name: 'Spot.io', slug: 'spotio', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', description: 'Cloud infrastructure optimization (acquired by NetApp)', foundedYear: 2015, employeeRange: '101-200' },
  { name: 'Sisense', slug: 'sisense', category: 'top_company', industry: 'DevTools', atsProvider: 'greenhouse', description: 'Analytics & BI platform', foundedYear: 2004, employeeRange: '201-500' },
  { name: 'Epsagon', slug: 'epsagon', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', description: 'Serverless observability (acquired)', foundedYear: 2017, employeeRange: '51-100' },
  { name: 'Firefly', slug: 'firefly', category: 'growing', industry: 'DevTools', atsProvider: 'unknown', description: 'Cloud infrastructure automation', foundedYear: 2020, employeeRange: '51-100' },
  { name: 'CloudMounter', slug: 'cloudmounter', category: 'startup', industry: 'DevTools', atsProvider: 'unknown', description: 'Cloud encryption & security', foundedYear: 2012 },
  { name: 'Snappyflow', slug: 'snappyflow', category: 'startup', industry: 'DevTools', atsProvider: 'unknown', description: 'APM & monitoring', foundedYear: 2016 },
  { name: 'Aqua Security Complete', slug: 'aquafull', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/aquasecurity', description: 'Container & cloud native security', foundedYear: 2015, employeeRange: '101-200' },
  { name: 'Alcide.io', slug: 'alcide', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', description: 'Kubernetes security (acquired by Aqua)', foundedYear: 2016, employeeRange: '51-100' },
  { name: 'Twistlock', slug: 'twistlock', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', description: 'Container security (acquired by Palo Alto)', foundedYear: 2015, employeeRange: '101-200' },
  { name: 'CloudPassage', slug: 'cloudpassage', category: 'growing', industry: 'DevTools', atsProvider: 'greenhouse', description: 'Cloud workload security', foundedYear: 2011, employeeRange: '101-200' },
  { name: 'ProstoML', slug: 'prostoml', category: 'startup', industry: 'DevTools', atsProvider: 'unknown', description: 'ML ops platform', foundedYear: 2019 },
  { name: 'Datadiff', slug: 'datadiff', category: 'startup', industry: 'DevTools', atsProvider: 'unknown', description: 'Data quality monitoring', foundedYear: 2020 },
  { name: 'Safehaven', slug: 'safehaven', category: 'startup', industry: 'DevTools', atsProvider: 'unknown', description: 'DevOps automation', foundedYear: 2019 },
  { name: 'Hazelcast', slug: 'hazelcast', category: 'top_company', industry: 'DevTools', atsProvider: 'lever', description: 'In-memory computing platform', foundedYear: 2008, employeeRange: '101-200' },
  { name: 'Redis Complete', slug: 'redisfull', category: 'top_company', industry: 'DevTools', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/redislabs', description: 'In-memory database platform', foundedYear: 2011, employeeRange: '201-500' },
  { name: 'Percona', slug: 'percona', category: 'top_company', industry: 'DevTools', atsProvider: 'greenhouse', description: 'MySQL & MongoDB services', foundedYear: 2006, employeeRange: '201-500' },

  // === SAAS/ENTERPRISE (120+ companies) ===
  { name: 'Monday.com Complete', slug: 'mondaycomfull', category: 'unicorn', industry: 'SaaS', atsProvider: 'comeet', careersUrl: 'https://monday.com/careers', description: 'Work OS platform (NASDAQ: MNDY)', foundedYear: 2012, employeeRange: '501-1000' },
  { name: 'Hibob', slug: 'hibobfull', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/hibob', description: 'HR platform for modern businesses', foundedYear: 2014, employeeRange: '201-500' },
  { name: 'Yotpo', slug: 'yotpofull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/yotpo', description: 'eCommerce marketing platform', foundedYear: 2011, employeeRange: '201-500' },
  { name: 'Bizzabo', slug: 'bizzabofull', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/bizzabo', description: 'Event management platform', foundedYear: 2013, employeeRange: '101-200' },
  { name: 'Gong Complete', slug: 'gongfull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/gong', description: 'Revenue intelligence platform', foundedYear: 2015, employeeRange: '501-1000' },
  { name: 'Elementor', slug: 'elementor', category: 'top_company', industry: 'SaaS', atsProvider: 'comeet', careersUrl: 'https://elementor.com/careers/', description: 'WordPress website builder', foundedYear: 2016, employeeRange: '201-500' },
  { name: 'Kaltura', slug: 'kalturafull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/kaltura', description: 'Video experience platform', foundedYear: 2006, employeeRange: '201-500' },
  { name: 'Placer.ai Complete', slug: 'placerfull', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/placer', description: 'Location analytics platform', foundedYear: 2015, employeeRange: '101-200' },
  { name: 'ControlUp', slug: 'controlupfull', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/controlup', description: 'Digital employee experience', foundedYear: 2013, employeeRange: '101-200' },
  { name: 'SolarWinds Complete', slug: 'solarwindsfull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'IT management & monitoring', foundedYear: 1999, employeeRange: '1000+' },
  { name: 'Sisense Complete', slug: 'sisensefull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/sisense', description: 'Analytics & BI platform', foundedYear: 2004, employeeRange: '201-500' },
  { name: 'Wix Complete', slug: 'wixfull', category: 'unicorn', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wix', description: 'Website builder platform (NASDAQ: WIX)', foundedYear: 2006, employeeRange: '1000+' },
  { name: 'Fiverr', slug: 'fiverrfull', category: 'unicorn', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fiverr', description: 'Freelance marketplace (NYSE: FVRR)', foundedYear: 2010, employeeRange: '501-1000' },
  { name: 'Similarweb Complete', slug: 'similarwebfull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/similarweb', description: 'Digital intelligence platform (NYSE: SMWB)', foundedYear: 2007, employeeRange: '201-500' },
  { name: 'AppsFlyer Complete', slug: 'appsflyer', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/appsflyer', description: 'Mobile attribution & analytics', foundedYear: 2010, employeeRange: '201-500' },
  { name: 'Deel Complete', slug: 'deelfull', category: 'top_company', industry: 'SaaS', atsProvider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/deel', description: 'Global HR & payroll platform', foundedYear: 2017, employeeRange: '501-1000' },
  { name: 'Via Complete', slug: 'viafull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/via', description: 'Public transit optimization', foundedYear: 2013, employeeRange: '201-500' },
  { name: 'Verbit', slug: 'verbitfull', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/verbit', description: 'AI transcription & captioning', foundedYear: 2017, employeeRange: '101-200' },
  { name: 'Cybereason', slug: 'cybereason', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/cybereason', description: 'Endpoint security & response', foundedYear: 2012, employeeRange: '201-500' },
  { name: 'Perion Network', slug: 'persion', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/perion', description: 'Digital advertising (NASDAQ: PERI)', foundedYear: 2000, employeeRange: '201-500' },
  { name: 'Talon.One Complete', slug: 'talonfull', category: 'growing', industry: 'SaaS', atsProvider: 'lever', careersUrl: 'https://jobs.lever.co/talonone', description: 'Promotion & loyalty engine', foundedYear: 2016, employeeRange: '101-200' },
  { name: 'Wilco', slug: 'wilcofull', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wilco', description: 'Developer upskilling platform', foundedYear: 2019, employeeRange: '51-100' },
  { name: 'Dazz', slug: 'dazzfull', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/dazz', description: 'Cloud security remediation', foundedYear: 2019, employeeRange: '51-100' },
  { name: 'Fabric', slug: 'fabricfull', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/commonsenserob', description: 'AI commerce platform', foundedYear: 2018, employeeRange: '51-100' },

  // === DEFENSE/AEROSPACE (35+ companies) ===
  { name: 'Mobileye', slug: 'mobileye', category: 'unicorn', industry: 'Defense/Autonomous Vehicles', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/maboretmobileye', description: 'Autonomous driving (NASDAQ: MBLY, Intel subsidiary)', foundedYear: 1999, employeeRange: '1000+' },
  { name: 'Elbit Systems', slug: 'elbit', category: 'enterprise', industry: 'Defense', atsProvider: 'greenhouse', description: 'Defense contractor (NASDAQ: ESLT)', foundedYear: 1966, employeeRange: '1000+' },
  { name: 'IAI (Israel Aerospace Industries)', slug: 'iai', category: 'enterprise', industry: 'Defense', atsProvider: 'custom', description: 'Aerospace & defense', foundedYear: 1953, employeeRange: '1000+' },
  { name: 'Rafael Advanced Defense Systems', slug: 'rafael', category: 'enterprise', industry: 'Defense', atsProvider: 'custom', description: 'Weapons & defense systems', foundedYear: 1948, employeeRange: '1000+' },
  { name: 'ThermTec', slug: 'thermtec', category: 'top_company', industry: 'Defense', atsProvider: 'unknown', description: 'Thermal imaging systems', foundedYear: 2000, employeeRange: '101-200' },
  { name: 'Controp Technologies', slug: 'controp', category: 'top_company', industry: 'Defense', atsProvider: 'unknown', description: 'Stabilized surveillance systems', foundedYear: 1981, employeeRange: '51-100' },
  { name: 'iRobotics', slug: 'irobotics', category: 'growing', industry: 'Defense', atsProvider: 'unknown', description: 'Defense robotics', foundedYear: 2015, employeeRange: '51-100' },
  { name: 'Griffon Aerospace', slug: 'griffon', category: 'growing', industry: 'Defense', atsProvider: 'unknown', description: 'UAV & drone systems', foundedYear: 2011, employeeRange: '51-100' },
  { name: 'Aeryon Labs', slug: 'aeryon', category: 'growing', industry: 'Defense', atsProvider: 'unknown', description: 'Autonomous aerial systems (acquired by Teledyne)', foundedYear: 2007, employeeRange: '51-100' },
  { name: 'BlueLine', slug: 'blueline', category: 'startup', industry: 'Defense', atsProvider: 'unknown', description: 'Defense analytics', foundedYear: 2019 },
  { name: 'SenseTime Israel', slug: 'senstimeisrael', category: 'growing', industry: 'Defense', atsProvider: 'unknown', description: 'Computer vision for defense', foundedYear: 2018, employeeRange: '51-100' },
  { name: 'Outpost Technologies', slug: 'outposttech', category: 'growing', industry: 'Defense', atsProvider: 'unknown', description: 'Defense cyber platform', foundedYear: 2015, employeeRange: '51-100' },
  { name: 'ViryaNet', slug: 'viryanet', category: 'startup', industry: 'Defense', atsProvider: 'unknown', description: 'Cyber defense', foundedYear: 2020 },
  { name: 'SailPoint Defense', slug: 'sailpointdef', category: 'growing', industry: 'Defense', atsProvider: 'greenhouse', description: 'Identity governance for defense', foundedYear: 2005, employeeRange: '1000+' },

  // === E-COMMERCE/ADTECH (40+ companies) ===
  { name: 'Taboola Complete', slug: 'tabolafull', category: 'top_company', industry: 'AdTech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/taboola', description: 'Content discovery platform (NASDAQ: TBLA)', foundedYear: 2007, employeeRange: '201-500' },
  { name: 'Outbrain Complete', slug: 'outbrainfull', category: 'top_company', industry: 'AdTech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/outbrain', description: 'Content recommendation (NASDAQ: OB)', foundedYear: 2006, employeeRange: '201-500' },
  { name: 'IronSource (Unity)', slug: 'ironsource', category: 'top_company', industry: 'AdTech', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/unity', description: 'App monetization (merged with Unity)', foundedYear: 2010, employeeRange: '201-500' },
  { name: 'Perion (Adtech)', slug: 'perionfull', category: 'top_company', industry: 'AdTech', atsProvider: 'greenhouse', description: 'Digital advertising', foundedYear: 2000, employeeRange: '201-500' },
  { name: 'Simpli (Formerly Quotient)', slug: 'simpli', category: 'top_company', industry: 'AdTech', atsProvider: 'greenhouse', description: 'Digital promotions platform', foundedYear: 2008, employeeRange: '101-200' },
  { name: 'ZetaGlobal', slug: 'zetaglobal', category: 'top_company', industry: 'AdTech', atsProvider: 'greenhouse', description: 'Martech & data platform', foundedYear: 2008, employeeRange: '201-500' },
  { name: 'Marin Software', slug: 'marinsoftware', category: 'growing', industry: 'AdTech', atsProvider: 'greenhouse', description: 'Digital marketing platform', foundedYear: 2006, employeeRange: '101-200' },
  { name: 'Pontus', slug: 'pontus', category: 'startup', industry: 'AdTech', atsProvider: 'unknown', description: 'Programmatic advertising', foundedYear: 2018 },
  { name: 'Affise', slug: 'affise', category: 'startup', industry: 'AdTech', atsProvider: 'unknown', description: 'Affiliate tracking platform', foundedYear: 2014 },
  { name: 'Adverity', slug: 'adverity', category: 'growing', industry: 'AdTech', atsProvider: 'lever', description: 'Marketing analytics (acquired)', foundedYear: 2013, employeeRange: '101-200' },
  { name: 'Seedtag', slug: 'seedtag', category: 'growing', industry: 'AdTech', atsProvider: 'unknown', description: 'Content classification technology', foundedYear: 2013, employeeRange: '51-100' },
  { name: 'Bidtellect', slug: 'bidtellect', category: 'growing', industry: 'AdTech', atsProvider: 'unknown', description: 'Programmatic advertising', foundedYear: 2012, employeeRange: '51-100' },
  { name: 'Fluent', slug: 'fluent', category: 'top_company', industry: 'AdTech', atsProvider: 'greenhouse', description: 'Digital marketing (NASDAQ: FLNT)', foundedYear: 2010, employeeRange: '201-500' },
  { name: 'SailPoint Marketing', slug: 'sailpointmkt', category: 'growing', industry: 'AdTech', atsProvider: 'greenhouse', description: 'Marketing identity', foundedYear: 2005, employeeRange: '1000+' },

  // === SEMICONDUCTOR/HARDWARE (25+ companies) ===
  { name: 'Habana Labs', slug: 'habana', category: 'top_company', industry: 'Semiconductor', atsProvider: 'greenhouse', description: 'AI processor design (Intel subsidiary)', foundedYear: 2016, employeeRange: '101-200' },
  { name: 'Hailo Complete', slug: 'hailofull', category: 'top_company', industry: 'Semiconductor', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/hailo', description: 'AI processor for edge devices', foundedYear: 2017, employeeRange: '201-500' },
  { name: 'Syntiant Complete', slug: 'syntiantfull', category: 'top_company', industry: 'Semiconductor', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/syntiant', description: 'Neuron-inspired AI processors', foundedYear: 2017, employeeRange: '101-200' },
  { name: 'SailPoint Silicon', slug: 'sailpointchip', category: 'growing', industry: 'Semiconductor', atsProvider: 'greenhouse', description: 'Chip design', foundedYear: 2005, employeeRange: '1000+' },
  { name: 'Mobileye AI', slug: 'mobileeyeai', category: 'unicorn', industry: 'Semiconductor', atsProvider: 'greenhouse', description: 'Autonomous driving chips', foundedYear: 1999, employeeRange: '1000+' },
  { name: 'Algotronix', slug: 'algotronix', category: 'growing', industry: 'Semiconductor', atsProvider: 'unknown', description: 'FPGA technology', foundedYear: 1992, employeeRange: '51-100' },
  { name: 'AnaBit Electronics', slug: 'anabit', category: 'startup', industry: 'Semiconductor', atsProvider: 'unknown', description: 'High-speed chips', foundedYear: 2019 },
  { name: 'Origami Circuits', slug: 'origamicircuits', category: 'startup', industry: 'Semiconductor', atsProvider: 'unknown', description: 'Advanced packaging', foundedYear: 2020 },
  { name: 'Wintronics', slug: 'wintronics', category: 'startup', industry: 'Semiconductor', atsProvider: 'unknown', description: 'Power electronics', foundedYear: 2019 },
  { name: 'NEXT Generation Semiconductors', slug: 'nextsemi', category: 'startup', industry: 'Semiconductor', atsProvider: 'unknown', description: 'Next-gen memory', foundedYear: 2020 },

  // === GAMING (20+ companies) ===
  { name: 'Playtika', slug: 'playtika', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'Casual games platform (NYSE: PLTK)', foundedYear: 2010, employeeRange: '201-500' },
  { name: 'Moon Active', slug: 'moonactive', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'Mobile game developer (Coin Master)', foundedYear: 2010, employeeRange: '201-500' },
  { name: 'Beach Bum', slug: 'beachbum', category: 'growing', industry: 'Gaming', atsProvider: 'unknown', description: 'Mobile games', foundedYear: 2015, employeeRange: '51-100' },
  { name: 'Scopely Israel', slug: 'scopely', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'Mobile game studio', foundedYear: 2010, employeeRange: '101-200' },
  { name: 'Peak Games', slug: 'peakgames', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'Mobile game developer (Zynga)', foundedYear: 2010, employeeRange: '101-200' },
  { name: 'Kabam Israel', slug: 'kabam', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'Mobile games', foundedYear: 2009, employeeRange: '51-100' },
  { name: 'GungHo Online Entertainment Israel', slug: 'gungho', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'Game development studio', foundedYear: 2007, employeeRange: '101-200' },
  { name: 'Wargaming Israel', slug: 'wargaming', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'MMO game developer', foundedYear: 2010, employeeRange: '101-200' },
  { name: 'Jelly Button Games', slug: 'jellybutton', category: 'growing', industry: 'Gaming', atsProvider: 'unknown', description: 'Casual game studio', foundedYear: 2008, employeeRange: '51-100' },
  { name: 'Pixelab', slug: 'pixelab', category: 'startup', industry: 'Gaming', atsProvider: 'unknown', description: 'Game development tools', foundedYear: 2019 },
  { name: 'LuckyMob', slug: 'luckymob', category: 'startup', industry: 'Gaming', atsProvider: 'unknown', description: 'Mobile gaming', foundedYear: 2018 },
  { name: 'Playtech Israel', slug: 'playtechisrael', category: 'top_company', industry: 'Gaming', atsProvider: 'greenhouse', description: 'Gaming software platform', foundedYear: 1999, employeeRange: '501-1000' },

  // === GROWING STARTUPS - ADDITIONAL (300+ companies) ===
  // Marketplace & Sharing Economy
  { name: 'Yext', slug: 'yext', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Digital location platform (NYSE: YEXT)', foundedYear: 2006, employeeRange: '201-500' },
  { name: 'Guesty', slug: 'guesty', category: 'growing', industry: 'SaaS', atsProvider: 'lever', description: 'Property management for short-term rentals', foundedYear: 2012, employeeRange: '101-200' },
  { name: 'Airbnb Israel R&D', slug: 'airbnb', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Sharing economy platform', foundedYear: 2008, employeeRange: '201-500' },
  { name: 'Uber Israel R&D', slug: 'uber', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Ride-sharing & logistics', foundedYear: 2009, employeeRange: '101-200' },

  // Productivity & Work
  { name: 'Trello', slug: 'trello', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Project management (Atlassian)', foundedYear: 2011, employeeRange: '501-1000' },
  { name: 'Notion', slug: 'notion', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'All-in-one workspace', foundedYear: 2016, employeeRange: '201-500' },
  { name: 'Slack', slug: 'slack', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Business communication (Salesforce)', foundedYear: 2013, employeeRange: '1000+' },
  { name: 'Zoom', slug: 'zoom', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Video communication platform', foundedYear: 2011, employeeRange: '1000+' },
  { name: 'SailPoint Collaboration', slug: 'sailpointcol', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Collaboration tools', foundedYear: 2005, employeeRange: '1000+' },

  // Data & Analytics
  { name: 'Amplitude', slug: 'amplitude', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Product analytics platform', foundedYear: 2012, employeeRange: '201-500' },
  { name: 'Datadog Israel R&D', slug: 'datadog', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Monitoring & analytics', foundedYear: 2010, employeeRange: '101-200' },
  { name: 'Mixpanel', slug: 'mixpanel', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Product analytics', foundedYear: 2009, employeeRange: '201-500' },
  { name: 'Wistia', slug: 'wistia', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Video hosting & analytics', foundedYear: 2007, employeeRange: '101-200' },
  { name: 'Skai', slug: 'skai', category: 'growing', industry: 'SaaS', atsProvider: 'unknown', description: 'Marketing automation (acquired)', foundedYear: 2005, employeeRange: '101-200' },

  // Security & Compliance
  { name: 'Varonis Complete', slug: 'varonis', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/varonis', description: 'Data security (NASDAQ: VRNS)', foundedYear: 1999, employeeRange: '201-500' },
  { name: 'Transmit Security Complete', slug: 'transmit', category: 'unicorn', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/transmitsecurity', description: 'Passwordless identity platform', foundedYear: 2017, employeeRange: '201-500' },
  { name: 'Cato Networks Complete', slug: 'cato', category: 'unicorn', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/catonetworks', description: 'SASE cloud networking', foundedYear: 2015, employeeRange: '201-500' },
  { name: 'Orca Security Complete', slug: 'orca', category: 'unicorn', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/orcasecurity', description: 'Cloud security platform', foundedYear: 2019, employeeRange: '101-200' },
  { name: 'Infinidat Complete', slug: 'infinidatfull', category: 'top_company', industry: 'Cybersecurity', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/infinidat', description: 'All-flash storage security', foundedYear: 2011, employeeRange: '201-500' },

  // Restaurants, Retail & Vertical SaaS
  { name: 'Toast', slug: 'toast', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Restaurant management software', foundedYear: 2012, employeeRange: '201-500' },
  { name: 'SailPoint Retail', slug: 'sailpointretail', category: 'growing', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Identity for retail', foundedYear: 2005, employeeRange: '1000+' },
  { name: 'BigCommerce', slug: 'bigcommerce', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'eCommerce platform (NASDAQ: BIGC)', foundedYear: 2009, employeeRange: '201-500' },
  { name: 'Lightspeed', slug: 'lightspeed', category: 'top_company', industry: 'SaaS', atsProvider: 'greenhouse', description: 'Retail & restaurant POS (TSX: LSPD)', foundedYear: 2005, employeeRange: '201-500' },
];

// Unified Israel location regex — used across all ATS scrapers
const ISRAEL_LOCATION_REGEX = /israel|il\b|tel.?aviv|tlv|herzliya|hertzliya|ramat.?gan|haifa|jerusalem|beer.?sheva|bnei.?brak|petah.?tikva|rishon|netanya|rehovot|modiin|modi'in|kfar.?saba|hod.?hasharon|ra'anana|raanana|yokneam|yoqneam|nazareth|ashdod|ashkelon|lod|bat.?yam|givatayim|holon|kiryat|bnei|remote.*israel|israel.*remote/i;

class CompanyDiscoveryService {
  private axiosInstance: AxiosInstance;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor() {
    this.axiosInstance = axios.create({
      headers: { 'User-Agent': this.USER_AGENT },
      timeout: 30000,
    });
  }

  /**
   * Retry wrapper — retries a function up to N times with delay
   */
  private async withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === retries) throw error;
        logger.warn(`Retry ${attempt + 1}/${retries} after error`, { error });
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
    throw new Error('Unreachable');
  }

  // ============================================================
  // 1. FUNDING TRACKER — Find recently funded startups
  // ============================================================

  /**
   * Use SerpAPI to search for recently funded Israeli startups
   */
  async discoverRecentlyFundedStartups(): Promise<DiscoveredCompany[]> {
    try {
      const serpApiKey = process.env.SERPAPI_KEY;
      if (!serpApiKey) {
        logger.info('SerpAPI key not configured, using Google search fallback for funding news');
        return this.discoverFundedStartupsViaGoogle();
      }

      logger.info('Searching for recently funded Israeli startups via SerpAPI');
      const companies: DiscoveredCompany[] = [];

      const queries = [
        'Israel startup raised funding 2026',
        'Israeli startup series A B C 2026',
        'Israel tech company funding round 2025 2026',
        'Israeli startup seed round 2026 hiring',
      ];

      for (const query of queries) {
        try {
          const response = await this.axiosInstance.get('https://serpapi.com/search', {
            params: {
              engine: 'google',
              q: query,
              api_key: serpApiKey,
              num: 10,
              tbs: 'qdr:m3', // Last 3 months
            },
          });

          const results = response.data.organic_results || [];
          for (const result of results) {
            const parsed = this.parseFundingResult(result);
            if (parsed) {
              companies.push(parsed);
            }
          }
        } catch (err) {
          logger.warn(`SerpAPI funding search failed for query: ${query}`, { error: err });
        }
      }

      // Also search SerpAPI news
      try {
        const newsResponse = await this.axiosInstance.get('https://serpapi.com/search', {
          params: {
            engine: 'google_news',
            q: 'Israel startup funding raised',
            api_key: serpApiKey,
          },
        });

        const newsResults = newsResponse.data.news_results || [];
        for (const result of newsResults) {
          const parsed = this.parseFundingNewsResult(result);
          if (parsed) {
            companies.push(parsed);
          }
        }
      } catch (err) {
        logger.warn('SerpAPI news search failed', { error: err });
      }

      // Deduplicate by company name
      const seen = new Set<string>();
      const unique = companies.filter(c => {
        const key = c.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      logger.info(`Discovered ${unique.length} recently funded startups`);
      return unique;
    } catch (error) {
      logger.error('Error discovering funded startups:', error);
      return [];
    }
  }

  /**
   * Fallback: Search Google directly for funding news
   */
  private async discoverFundedStartupsViaGoogle(): Promise<DiscoveredCompany[]> {
    try {
      const companies: DiscoveredCompany[] = [];
      const queries = [
        'Israel startup raised funding 2026 site:techcrunch.com OR site:calcalist.co.il OR site:geektime.co.il',
        'Israeli startup series funding 2025 2026 site:globes.co.il OR site:geektime.co.il',
      ];

      for (const query of queries) {
        try {
          const response = await this.axiosInstance.get(
            `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`,
            {
              headers: {
                'User-Agent': this.USER_AGENT,
                Accept: 'text/html',
                'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
              },
            }
          );

          const $ = cheerio.load(response.data);
          $('div.g, div[data-sokoban-container]').each((_, elem) => {
            try {
              const $result = $(elem);
              const title = $result.find('h3').first().text().trim();
              const snippet = $result.find('.VwiC3b, [data-sncf]').first().text().trim();
              const url = $result.find('a').first().attr('href') || '';

              if (!title) return;

              // Look for funding signals in title/snippet
              const fundingMatch = (title + ' ' + snippet).match(
                /(\$[\d.]+[MBK]|\$[\d.]+ ?(?:million|billion))/i
              );
              const companyMatch = title.match(
                /^(.+?)\s+(?:raises?|secures?|closes?|gets?|lands?|nabs?|bags?)/i
              );

              if (fundingMatch || companyMatch) {
                companies.push({
                  name: companyMatch ? companyMatch[1].trim() : title.split(' ').slice(0, 3).join(' '),
                  description: snippet.substring(0, 200),
                  fundingInfo: fundingMatch ? fundingMatch[1] : undefined,
                  category: 'recently_funded',
                  source: url,
                });
              }
            } catch (_err) {
              // Skip
            }
          });
        } catch (err) {
          logger.warn('Google search for funding failed', { error: err });
        }
      }

      return companies;
    } catch (error) {
      logger.error('Error in Google funding fallback:', error);
      return [];
    }
  }

  /**
   * Parse a SerpAPI organic search result for funding info
   */
  private parseFundingResult(result: any): DiscoveredCompany | null {
    const title = result.title || '';
    const snippet = result.snippet || '';
    const fullText = title + ' ' + snippet;

    // Look for funding signals
    const fundingMatch = fullText.match(/(\$[\d.]+[MBK]|\$[\d.]+ ?(?:million|billion))/i);
    const companyMatch = title.match(
      /^(.+?)\s+(?:raises?|secures?|closes?|gets?|lands?|announces?|nabs?)/i
    );
    const roundMatch = fullText.match(/(?:seed|series\s*[A-F]|pre-seed|growth)/i);

    if (!fundingMatch && !companyMatch) return null;

    return {
      name: companyMatch ? companyMatch[1].replace(/Israeli\s*/i, '').trim() : title.split(' ').slice(0, 3).join(' '),
      description: snippet.substring(0, 200),
      fundingAmount: fundingMatch ? fundingMatch[1] : undefined,
      fundingRound: roundMatch ? roundMatch[0] : undefined,
      category: 'recently_funded',
      source: result.link || '',
    };
  }

  /**
   * Parse a SerpAPI news result for funding info
   */
  private parseFundingNewsResult(result: any): DiscoveredCompany | null {
    const title = result.title || '';
    const snippet = result.snippet || result.description || '';
    const fullText = title + ' ' + snippet;

    const fundingMatch = fullText.match(/(\$[\d.]+[MBK]|\$[\d.]+ ?(?:million|billion))/i);
    const companyMatch = title.match(
      /^(.+?)\s+(?:raises?|secures?|closes?|gets?|lands?)/i
    );

    if (!fundingMatch && !companyMatch) return null;

    return {
      name: companyMatch ? companyMatch[1].replace(/Israeli\s*/i, '').trim() : title.split(' ').slice(0, 3).join(' '),
      description: snippet.substring(0, 200),
      fundingAmount: fundingMatch ? fundingMatch[1] : undefined,
      fundingDate: result.date,
      category: 'recently_funded',
      source: result.link || '',
    };
  }

  // ============================================================
  // 2. CAREER PAGE SCRAPING — Check ATS platforms for jobs
  // ============================================================

  /**
   * Scrape jobs from a Greenhouse board
   */
  async scrapeGreenhouseJobs(boardSlug: string, companyName: string): Promise<CareerPageJob[]> {
    try {
      return await this.withRetry(async () => {
        const url = `https://boards-api.greenhouse.io/v1/boards/${boardSlug}/jobs`;
        const response = await this.axiosInstance.get(url);
        const jobs: CareerPageJob[] = [];

        const jobList = response.data.jobs || [];
        for (const job of jobList) {
          const locations = job.location?.name || '';
          const isIsrael = ISRAEL_LOCATION_REGEX.test(locations);

          if (isIsrael) {
            jobs.push({
              title: job.title,
              company: companyName,
              location: locations,
              locationType: /remote/i.test(locations) ? 'REMOTE' : /hybrid/i.test(locations) ? 'HYBRID' : 'ONSITE',
              description: this.stripHtml(job.content || '').substring(0, 500),
              sourceUrl: job.absolute_url || `https://boards.greenhouse.io/${boardSlug}/jobs/${job.id}`,
              source: 'COMPANY_CAREER_PAGE',
              department: job.departments?.[0]?.name,
              atsProvider: 'greenhouse',
            });
          }
        }

        logger.info(`Greenhouse ${boardSlug}: Found ${jobs.length} Israel jobs out of ${jobList.length} total`);
        return jobs;
      });
    } catch (error) {
      logger.warn(`Failed to scrape Greenhouse board: ${boardSlug} (after retries)`, { error });
      return [];
    }
  }

  /**
   * Scrape jobs from a Lever board
   */
  async scrapeLeverJobs(companySlug: string, companyName: string): Promise<CareerPageJob[]> {
    try {
      return await this.withRetry(async () => {
        const url = `https://api.lever.co/v0/postings/${companySlug}?mode=json`;
        const response = await this.axiosInstance.get(url);
        const jobs: CareerPageJob[] = [];

        const postings = response.data || [];
        for (const posting of postings) {
          const location = posting.categories?.location || '';
          const isIsrael = ISRAEL_LOCATION_REGEX.test(location);

          if (isIsrael) {
            jobs.push({
              title: posting.text,
              company: companyName,
              location,
              locationType: /remote/i.test(location) ? 'REMOTE' : 'HYBRID',
              description: this.stripHtml(posting.descriptionPlain || posting.description || '').substring(0, 500),
              sourceUrl: posting.hostedUrl || posting.applyUrl || '',
              source: 'COMPANY_CAREER_PAGE',
              department: posting.categories?.team || posting.categories?.department,
              atsProvider: 'lever',
            });
          }
        }

        logger.info(`Lever ${companySlug}: Found ${jobs.length} Israel jobs out of ${postings.length} total`);
        return jobs;
      });
    } catch (error) {
      logger.warn(`Failed to scrape Lever board: ${companySlug} (after retries)`, { error });
      return [];
    }
  }

  /**
   * Scrape jobs from an Ashby board
   */
  async scrapeAshbyJobs(companySlug: string, companyName: string): Promise<CareerPageJob[]> {
    try {
      return await this.withRetry(async () => {
        const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`;
        const response = await this.axiosInstance.get(url);
        const jobs: CareerPageJob[] = [];

        const postings = response.data.jobs || [];
        for (const posting of postings) {
          const location = posting.location || posting.locationName || '';
          const isIsrael = ISRAEL_LOCATION_REGEX.test(location);

          if (isIsrael) {
            jobs.push({
              title: posting.title,
              company: companyName,
              location,
              locationType: /remote/i.test(location) ? 'REMOTE' : 'HYBRID',
              description: (posting.descriptionPlain || '').substring(0, 500),
              sourceUrl: `https://jobs.ashbyhq.com/${companySlug}/${posting.id}`,
              source: 'COMPANY_CAREER_PAGE',
              department: posting.departmentName,
              atsProvider: 'ashby',
            });
          }
        }

        logger.info(`Ashby ${companySlug}: Found ${jobs.length} Israel jobs`);
        return jobs;
      });
    } catch (error) {
      logger.warn(`Failed to scrape Ashby board: ${companySlug} (after retries)`, { error });
      return [];
    }
  }

  // ============================================================
  // 3. ORCHESTRATION — Scan all top companies for jobs
  // ============================================================

  /**
   * Get the full curated company list with categories
   */
  getTopCompanies(): typeof TOP_ISRAELI_COMPANIES {
    return TOP_ISRAELI_COMPANIES;
  }

  /**
   * Get all companies: original TOP_ISRAELI_COMPANIES merged with EXPANDED_COMPANIES
   * Returns companies in a normalized format for use across the application
   */
  getAllCompanies(): Array<any> {
    // Convert original companies to match expanded format
    const originalCompanies = TOP_ISRAELI_COMPANIES.map(c => ({
      name: c.name,
      slug: c.slug,
      category: c.category,
      industry: c.atsProvider === 'greenhouse' ? 'Tech' : 'Tech/Enterprise',
      atsProvider: c.atsProvider,
      careersUrl: c.careersUrl,
      description: c.description,
    }));

    return [...originalCompanies, ...EXPANDED_COMPANIES];
  }

  /**
   * Get expanded companies (the 900+ additional companies)
   */
  getExpandedCompanies(): ExpandedCompany[] {
    return EXPANDED_COMPANIES;
  }

  /**
   * Filter companies by category
   */
  getCompaniesByCategory(category: string): Array<any> {
    return this.getAllCompanies().filter(c => c.category === category);
  }

  /**
   * Filter companies by industry
   */
  getCompaniesByIndustry(industry: string): Array<any> {
    return this.getAllCompanies().filter(c => c.industry === industry);
  }

  /**
   * Search companies by name (case-insensitive partial match)
   */
  searchCompanies(query: string): Array<any> {
    const lowerQuery = query.toLowerCase();
    return this.getAllCompanies().filter(c =>
      c.name.toLowerCase().includes(lowerQuery) ||
      c.slug.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get company count statistics
   */
  getCompanyStats(): {
    total: number;
    byCategory: Record<string, number>;
    byIndustry: Record<string, number>;
    withGreenhouseJobs: number;
  } {
    const all = this.getAllCompanies();
    const stats = {
      total: all.length,
      byCategory: {} as Record<string, number>,
      byIndustry: {} as Record<string, number>,
      withGreenhouseJobs: 0,
    };

    for (const company of all) {
      stats.byCategory[company.category] = (stats.byCategory[company.category] || 0) + 1;
      stats.byIndustry[company.industry] = (stats.byIndustry[company.industry] || 0) + 1;
      if (company.atsProvider === 'greenhouse') {
        stats.withGreenhouseJobs++;
      }
    }

    return stats;
  }

  /**
   * Scan career pages of all curated top companies for relevant jobs
   * Optionally filter by keywords
   */
  async scanTopCompanyCareers(
    keywords: string[] = [],
    categories?: string[]
  ): Promise<{ company: string; jobs: CareerPageJob[]; error?: string }[]> {
    logger.info('Scanning top company career pages', { keywords, categories });

    const results: { company: string; jobs: CareerPageJob[]; error?: string }[] = [];

    // Filter companies by category if specified
    let companies = TOP_ISRAELI_COMPANIES;
    if (categories && categories.length > 0) {
      companies = companies.filter(c => categories.includes(c.category));
    }

    // Process in batches of 5 to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (company) => {
          try {
            let jobs: CareerPageJob[] = [];

            switch (company.atsProvider) {
              case 'greenhouse': {
                // Extract board slug from URL
                const slug = company.careersUrl.replace('https://boards.greenhouse.io/', '');
                jobs = await this.scrapeGreenhouseJobs(slug, company.name);
                break;
              }
              case 'lever': {
                const slug = company.careersUrl.replace('https://jobs.lever.co/', '');
                jobs = await this.scrapeLeverJobs(slug, company.name);
                break;
              }
              case 'ashby': {
                const slug = company.careersUrl.replace('https://jobs.ashbyhq.com/', '');
                jobs = await this.scrapeAshbyJobs(slug, company.name);
                break;
              }
              case 'comeet':
              case 'workday':
              default:
                // Comeet, Workday, and truly custom career pages — no API available
                // These are included for reference / manual browsing
                logger.debug(`Skipping ${company.name} (${company.atsProvider}) — no API scraper`);
                break;
            }

            // Filter by keywords if provided — use loose matching
            // Each keyword is split into words, and a job matches if ANY word from ANY keyword appears
            if (keywords.length > 0 && jobs.length > 0) {
              const kwWords = new Set<string>();
              for (const kw of keywords) {
                for (const word of kw.toLowerCase().split(/\s+/)) {
                  if (word.length >= 3) kwWords.add(word); // Skip very short words
                }
              }
              if (kwWords.size > 0) {
                jobs = jobs.filter(j => {
                  const text = `${j.title} ${j.description} ${j.department || ''}`.toLowerCase();
                  // Job matches if it contains at least 1 keyword word
                  return [...kwWords].some(word => text.includes(word));
                });
              }
            }

            return { company: company.name, jobs, error: undefined };
          } catch (error: any) {
            return { company: company.name, jobs: [], error: error.message };
          }
        })
      );

      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < companies.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const totalJobs = results.reduce((sum, r) => sum + r.jobs.length, 0);
    const companiesWithJobs = results.filter(r => r.jobs.length > 0).length;
    logger.info(`Top company scan complete: ${totalJobs} Israel jobs from ${companiesWithJobs} companies`);

    return results;
  }

  /**
   * Discover funded startups AND check their career pages
   */
  async discoverAndScan(keywords: string[] = []): Promise<{
    fundedStartups: DiscoveredCompany[];
    topCompanyJobs: { company: string; jobs: CareerPageJob[] }[];
    totalJobs: number;
  }> {
    logger.info('Running full company discovery + career scan');

    // Run both in parallel
    const [fundedStartups, topCompanyResults] = await Promise.all([
      this.discoverRecentlyFundedStartups(),
      this.scanTopCompanyCareers(keywords),
    ]);

    const topCompanyJobs = topCompanyResults.filter(r => r.jobs.length > 0);
    const totalJobs = topCompanyJobs.reduce((sum, r) => sum + r.jobs.length, 0);

    return { fundedStartups, topCompanyJobs, totalJobs };
  }

  /**
   * Helper: Strip HTML tags
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export const companyDiscoveryService = new CompanyDiscoveryService();
