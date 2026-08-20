// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { amazonUrl } from '../lib/appConfig';
import type { SystemProfile } from '../types';
import { ExternalLink, ShoppingCart, Zap } from 'lucide-react';

/** Moved out of App.tsx with UpgradeRig, its only consumer. */
type TurnkeySystem = {
  name: string;
  spec: string;
  priceRange: string;
  benefit: string;
  searchQuery: string;
};

/** Moved out of App.tsx with UpgradeRig, its only consumer. */
type UpgradeCard = {
  name: string;
  category: 'GPU' | 'RAM' | 'System';
  spec: string;
  priceRange: string;
  benefit: string;
  searchQuery: string;
};

/** Moved out of App.tsx with UpgradeRig, its only consumer. */
function getUpgradeRecommendations(system: SystemProfile): UpgradeCard[] {
  const vram = system.gpu.vramGb ?? 0;
  const vendor = (system.gpu.vendor ?? '').toLowerCase();
  const totalRamGb = system.memory.totalGb ?? 0;
  const isAppleSilicon = vendor.includes('apple') || (system.platform === 'darwin' && vram === 0);

  if (isAppleSilicon) {
    if (totalRamGb < 18) {
      return [{
        name: 'MacBook Pro M3 Pro / M4 Pro',
        category: 'System',
        spec: '18–36 GB unified',
        priceRange: 'from ~$1,999',
        benefit: 'Unified memory architecture runs 13B models smoothly without a discrete GPU',
        searchQuery: 'MacBook Pro M3 Pro 18GB',
      }];
    }
    return [];
  }

  const cards: UpgradeCard[] = [];

  if (vram <= 2) {
    cards.push(
      {
        name: 'NVIDIA RTX 4060',
        category: 'GPU',
        spec: '8 GB VRAM',
        priceRange: '~$300',
        benefit: 'Run 7B models on the GPU — dramatically faster than CPU-only inference',
        searchQuery: 'NVIDIA GeForce RTX 4060 graphics card',
      },
      {
        name: 'NVIDIA RTX 4060 Ti',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$450',
        benefit: 'Run 7B–13B models comfortably, plus quantized 30B variants',
        searchQuery: 'NVIDIA GeForce RTX 4060 Ti 16GB graphics card',
      },
    );
  } else if (vram <= 6) {
    cards.push(
      {
        name: 'NVIDIA RTX 4060',
        category: 'GPU',
        spec: '8 GB VRAM',
        priceRange: '~$300',
        benefit: 'Full 7B model support — the entry point for comfortable local AI',
        searchQuery: 'NVIDIA GeForce RTX 4060 graphics card',
      },
      {
        name: 'NVIDIA RTX 4060 Ti',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$450',
        benefit: 'Run 13B models and larger quantized variants without breaking a sweat',
        searchQuery: 'NVIDIA GeForce RTX 4060 Ti 16GB graphics card',
      },
    );
  } else if (vram <= 10) {
    cards.push(
      {
        name: 'NVIDIA RTX 4060 Ti',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$450',
        benefit: 'Doubles your VRAM — unlocks 13B models and quantized 30B variants',
        searchQuery: 'NVIDIA GeForce RTX 4060 Ti 16GB graphics card',
      },
      {
        name: 'NVIDIA RTX 4090',
        category: 'GPU',
        spec: '24 GB VRAM',
        priceRange: '~$1,800',
        benefit: 'Top consumer GPU — runs 70B models with full quantization support',
        searchQuery: 'NVIDIA GeForce RTX 4090 graphics card',
      },
    );
  } else if (vram <= 14) {
    cards.push(
      {
        name: 'NVIDIA RTX 4070 Ti Super',
        category: 'GPU',
        spec: '16 GB VRAM',
        priceRange: '~$800',
        benefit: 'Adds 4 GB VRAM — opens larger 13B variants and quantized 30B models',
        searchQuery: 'NVIDIA GeForce RTX 4070 Ti Super graphics card',
      },
      {
        name: 'NVIDIA RTX 4090',
        category: 'GPU',
        spec: '24 GB VRAM',
        priceRange: '~$1,800',
        benefit: 'Doubles your VRAM — full 70B model access on consumer hardware',
        searchQuery: 'NVIDIA GeForce RTX 4090 graphics card',
      },
    );
  } else if (vram <= 20) {
    cards.push({
      name: 'NVIDIA RTX 4090',
      category: 'GPU',
      spec: '24 GB VRAM',
      priceRange: '~$1,800',
      benefit: 'Unlocks 70B models — the biggest single jump on consumer hardware',
      searchQuery: 'NVIDIA GeForce RTX 4090 graphics card',
    });
  }

  if (cards.length === 0 && totalRamGb < 32) {
    cards.push({
      name: '32 GB DDR5 RAM Kit',
      category: 'RAM',
      spec: '32 GB system RAM',
      priceRange: '~$80–120',
      benefit: 'More RAM helps CPU-offloaded model layers and keeps the system stable under load',
      searchQuery: '32GB DDR5 RAM desktop kit',
    });
  }

  return cards;
}

/** Moved out of App.tsx with UpgradeRig, its only consumer. */
const TURNKEY_SYSTEMS: TurnkeySystem[] = [
  {
    name: 'Apple Mac Studio (M4 Max)',
    spec: '36–128 GB unified memory',
    priceRange: 'from ~$1,999',
    benefit: 'Unified memory means every GB counts for AI — a 36 GB M4 Max runs 30B models with headroom to spare, silently, without a separate GPU',
    searchQuery: 'Apple Mac Studio M4 Max',
  },
  {
    name: 'CyberpowerPC Gamer Xtreme',
    spec: 'RTX 4070 Ti · 16 GB VRAM',
    priceRange: 'from ~$1,499',
    benefit: 'Pre-built Windows AI rig — 16 GB VRAM handles 13B models comfortably, plug-and-play, ready for Ollama out of the box',
    searchQuery: 'CyberpowerPC gaming desktop RTX 4070 Ti 16GB',
  },
];

export function UpgradeRig({ system }: { system: SystemProfile }) {
  const cards = getUpgradeRecommendations(system);
  const vendor = (system.gpu.vendor ?? '').toLowerCase();
  const isAppleSilicon = vendor.includes('apple') || (system.platform === 'darwin' && (system.gpu.vramGb ?? 0) === 0);
  const showTurnkey = !isAppleSilicon;

  if (cards.length === 0 && !showTurnkey) return null;

  const currentSpec = system.gpu.vramGb
    ? `${system.gpu.vramGb} GB VRAM · ${system.gpu.model}`
    : `${Math.round(system.memory.totalGb)} GB RAM · No discrete GPU`;

  return (
    <div className="upgrade-rig-panel">
      <div className="upgrade-rig-heading">
        <Zap aria-hidden="true" />
        <div>
          <span>Upgrade path</span>
          <strong>Unlock more models</strong>
        </div>
      </div>
      {/* Disclosure sits ABOVE the offers, not after them — a reader should know
          these are affiliate links before they read the recommendations, not
          after. Especially here, where the app has just scored their hardware. */}
      <p className="upgrade-disclosure">
        Affiliate links — purchases support RigMatch at no extra cost to you. Your hardware
        score is calculated from your specs alone and is not affected by these.
      </p>
      {cards.length > 0 && (
        <>
          <p className="upgrade-rig-intro">
            Your rig: <strong>{currentSpec}</strong>. Here {cards.length === 1 ? 'is the next upgrade' : `are ${cards.length} upgrades`} that open more models.
          </p>
          <div className="upgrade-cards">
            {cards.map((card) => (
              <div key={card.name} className="upgrade-card">
                <div className="upgrade-card-head">
                  <span className={`upgrade-card-category category-${card.category.toLowerCase()}`}>{card.category}</span>
                  <strong>{card.name}</strong>
                  <div className="upgrade-card-meta">
                    <span className="upgrade-card-spec">{card.spec}</span>
                    <span className="upgrade-card-price">{card.priceRange}</span>
                  </div>
                </div>
                <p className="upgrade-card-benefit">{card.benefit}</p>
                <a
                  href={amazonUrl(card.searchQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="amazon-buy-btn"
                  aria-label={`Search for ${card.name} on Amazon`}
                >
                  <ShoppingCart aria-hidden="true" />
                  View on Amazon
                  <ExternalLink aria-hidden="true" className="amazon-ext-icon" />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
      {showTurnkey && (
        <>
          <p className="upgrade-rig-intro upgrade-turnkey-intro">
            Or skip the upgrade path — these turnkey systems are built for local AI from day one:
          </p>
          <div className="upgrade-cards">
            {TURNKEY_SYSTEMS.map((sys) => (
              <div key={sys.name} className="upgrade-card upgrade-card-turnkey">
                <div className="upgrade-card-head">
                  <span className="upgrade-card-category category-system">System</span>
                  <strong>{sys.name}</strong>
                  <div className="upgrade-card-meta">
                    <span className="upgrade-card-spec">{sys.spec}</span>
                    <span className="upgrade-card-price">{sys.priceRange}</span>
                  </div>
                </div>
                <p className="upgrade-card-benefit">{sys.benefit}</p>
                <a
                  href={amazonUrl(sys.searchQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="amazon-buy-btn"
                  aria-label={`Search for ${sys.name} on Amazon`}
                >
                  <ShoppingCart aria-hidden="true" />
                  View on Amazon
                  <ExternalLink aria-hidden="true" className="amazon-ext-icon" />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
