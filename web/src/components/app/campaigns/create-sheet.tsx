"use client";

/**
 * Meta-style create flow in a side sheet: Campaign → Ad set → Ad.
 * Starts at whichever level was requested and can create just that level or
 * everything below it in one go. Everything is created paused; a failure
 * keeps what was already created and lets the user fix and retry from there.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/components/app/campaigns/toasts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AdPreview } from "@/components/app/campaigns/ad-preview";
import { MediaGrid, mediaProblem, useAdMedia, type MediaItem } from "@/components/app/campaigns/ad-media";
import {
  AudiencePicker,
  BiddingFields,
  DEFAULT_EXTRAS,
  LocationSearch,
  PlacementsPicker,
  TargetingSearch,
  type AdSetExtras,
} from "@/components/app/campaigns/adset-settings";
import { CountryPicker } from "@/components/app/campaigns/country-picker";
import {
  type CreateRequest,
  useManage,
} from "@/components/app/campaigns/manage-context";
import {
  AGES,
  BID_STRATEGIES,
  CTAS,
  NEEDS_PROMOTED_OBJECT,
  OBJECTIVES,
  PIXEL_EVENTS,
  SPECIAL_CATEGORIES,
  goalsFor,
} from "@/components/app/campaigns/meta-options";
import { budgetPhrase, formatMoney } from "@/components/app/campaigns/format";
import type { Ad, AdGroup, Campaign } from "@/lib/entities-api";
import { useAdGroups, useCampaigns } from "@/lib/entities-api";
import {
  type AdCreativeInput,
  type BidStrategy,
  type CallToAction,
  type CreateAdInput,
  type Level,
  type MetaObjective,
  type PlacementsInput,
  useCreateAd,
  useCreateAdGroup,
  useCreateCampaign,
  usePages,
} from "@/lib/manage-api";
import { useAdAccounts } from "@/lib/queries";
import { cn } from "@/lib/utils";

const ORDER: Level[] = ["campaign", "ad_group", "ad"];
const STEP_LABEL: Record<Level, string> = {
  campaign: "Campaign",
  ad_group: "Ad set",
  ad: "Ad",
};

interface CampaignDraft {
  accountId: string;
  name: string;
  objective: MetaObjective;
  budgetMode: "campaign" | "ad_set";
  budgetType: "daily" | "lifetime";
  amount: string;
  endTime: string;
  special: string;
  /** With a campaign budget, the campaign's bid strategy. */
  bidStrategy: BidStrategy;
}

interface AdGroupDraft extends AdSetExtras {
  campaignId: string;
  name: string;
  budgetType: "daily" | "lifetime";
  amount: string;
  startTime: string;
  endTime: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "men" | "women";
  advantage: boolean;
  goal: string;
  /** promoted_object inputs, per objective. */
  pixelId: string;
  eventType: string;
  leadPageId: string;
  appId: string;
  storeUrl: string;
}

/**
 * single: one image or video. carousel: 2–10 swipeable cards. flexible: up to
 * 10 media and 5 of each text, Meta mixes them. multi: one single-media ad
 * per file, to test which wins. post: promote an existing Page post.
 */
type AdSource = "single" | "carousel" | "flexible" | "multi" | "post";

interface CardText {
  headline: string;
  description: string;
  link: string;
}

interface AdDraft {
  adGroupId: string;
  name: string;
  pageId: string;
  /** Show on Instagram as the Page's linked account (else as the Page). */
  useInstagram: boolean;
  source: AdSource;
  /** Up to 5 each for flexible ads; other formats use the first. */
  messages: string[];
  headlines: string[];
  descriptions: string[];
  cards: Record<string, CardText>;
  link: string;
  displayLink: string;
  urlTags: string;
  cta: CallToAction;
  postId: string;
}

const MEDIA_LIMITS: Record<Exclude<AdSource, "post">, { min: number; max: number }> = {
  single: { min: 1, max: 1 },
  carousel: { min: 2, max: 10 },
  flexible: { min: 1, max: 10 },
  multi: { min: 2, max: 20 },
};

const FLEXIBLE_OBJECTIVES = new Set(["OUTCOME_SALES", "OUTCOME_APP_PROMOTION"]);

function firstText(list: string[]) {
  return (list[0] ?? "").trim();
}

function texts(list: string[]) {
  return list.map((t) => t.trim()).filter(Boolean);
}

export function CreateSheet({
  req,
  onClose,
}: {
  req: CreateRequest | null;
  onClose: () => void;
}) {
  const [wide, setWide] = useState(false);
  return (
    <Sheet open={!!req} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className={cn(
          "w-full gap-0 bg-surface p-0 transition-[max-width] duration-200",
          wide ? "sm:max-w-[920px]" : "sm:max-w-[560px]",
        )}
      >
        {req && (
          <CreateFlow
            key={JSON.stringify([req.level, req.campaign?.id, req.adGroup?.id])}
            req={req}
            onClose={onClose}
            onWide={setWide}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function iso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function amountOf(s: string): number | null {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

function validUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function CreateFlow({
  req,
  onClose,
  onWide,
}: {
  req: CreateRequest;
  onClose: () => void;
  onWide: (w: boolean) => void;
}) {
  const m = useManage();
  const orgId = m.orgId;
  const accounts = useAdAccounts(orgId);
  const metaAccounts = (accounts.data?.accounts ?? []).filter(
    (a) => a.provider === "meta",
  );
  const steps = ORDER.slice(ORDER.indexOf(req.level));
  const [step, setStep] = useState<Level>(req.level);
  const [created, setCreated] = useState<{
    campaign?: Campaign;
    ad_group?: AdGroup;
    ad?: Ad;
  }>({});
  const [submitting, setSubmitting] = useState<Level | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createCampaign = useCreateCampaign(orgId);
  const createAdGroup = useCreateAdGroup(orgId);
  const createAd = useCreateAd(orgId);

  // Parent pickers (only needed when starting below the campaign level).
  const metaCampaigns = useCampaigns(
    orgId,
    { provider: "meta", limit: 200 },
    req.level === "ad_group",
  );
  const metaAdGroups = useAdGroups(
    orgId,
    { provider: "meta", limit: 200 },
    req.level === "ad",
  );

  const [c, setC] = useState<CampaignDraft>(() => ({
    accountId: req.accountId ?? "",
    name: "",
    objective: "OUTCOME_TRAFFIC",
    budgetMode: "campaign",
    budgetType: "daily",
    amount: "",
    endTime: "",
    special: "NONE",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
  }));
  const [g, setG] = useState<AdGroupDraft>(() => ({
    campaignId: req.campaign?.provider === "meta" ? req.campaign.id : "",
    name: "",
    budgetType: "daily",
    amount: "",
    startTime: "",
    endTime: "",
    countries: ["IN"],
    ageMin: 18,
    ageMax: 65,
    gender: "all",
    advantage: true,
    goal: "",
    pixelId: "",
    eventType: "PURCHASE",
    leadPageId: "",
    appId: "",
    storeUrl: "",
    ...DEFAULT_EXTRAS,
  }));
  const [a, setA] = useState<AdDraft>(() => ({
    adGroupId: req.adGroup?.provider === "meta" ? req.adGroup.id : "",
    name: "",
    pageId: "",
    useInstagram: true,
    source: "single",
    messages: [""],
    headlines: [""],
    descriptions: [""],
    cards: {},
    link: "https://",
    displayLink: "",
    urlTags: "",
    cta: "LEARN_MORE",
    postId: "",
  }));
  // How many ads of a "several ads" batch are already created (for retries).
  const [multiDone, setMultiDone] = useState(0);

  // Default to the only Meta account when there's just one.
  const accountDefault =
    !c.accountId && metaAccounts.length === 1
      ? metaAccounts[0].id
      : c.accountId;

  const parentCampaign: Campaign | undefined =
    created.campaign ??
    (req.level === "ad_group"
      ? (metaCampaigns.data?.rows.find((x) => x.id === g.campaignId) ??
        (req.campaign?.id === g.campaignId ? req.campaign : undefined))
      : undefined);
  const parentAdGroup: AdGroup | undefined =
    created.ad_group ??
    (req.level === "ad"
      ? (metaAdGroups.data?.rows.find((x) => x.id === a.adGroupId) ??
        (req.adGroup?.id === a.adGroupId ? req.adGroup : undefined))
      : undefined);

  const accountId =
    req.level === "campaign"
      ? accountDefault
      : req.level === "ad_group"
        ? parentCampaign?.account_id
        : parentAdGroup?.account_id;
  const account = accounts.data?.accounts.find((x) => x.id === accountId);
  const media = useAdMedia(orgId, accountId);
  // Empty until an account (or parent) is known; labels then read "Amount" without a currency.
  const currency =
    account?.currency ??
    parentCampaign?.currency ??
    parentAdGroup?.currency ??
    "";
  const objective: string =
    req.level === "campaign"
      ? c.objective
      : (parentCampaign?.objective ?? "OUTCOME_TRAFFIC");
  const goals = goalsFor(objective);
  const goal = goals.find((x) => x.value === g.goal) ?? goals[0];
  const campaignHasBudget =
    req.level === "campaign"
      ? c.budgetMode === "campaign"
      : parentCampaign
        ? parentCampaign.daily_budget != null ||
          parentCampaign.lifetime_budget != null
        : false;

  // The strategy an ad set inherits when the campaign carries the budget.
  const campaignStrategy: BidStrategy | "unknown" | null = !campaignHasBudget
    ? null
    : req.level === "campaign"
      ? c.bidStrategy
      : "unknown";
  const flexibleAllowed = FLEXIBLE_OBJECTIVES.has(objective);

  const pages = usePages(
    orgId,
    accountId,
    steps.includes("ad") ||
      (steps.includes("ad_group") && objective === "OUTCOME_LEADS"),
  );
  const leadPage =
    pages.data?.find((p) => p.id === g.leadPageId) ??
    (pages.data?.length === 1 ? pages.data[0] : undefined);

  function promotedObject(): Record<string, string> | undefined {
    if (objective === "OUTCOME_SALES")
      return { pixel_id: g.pixelId.trim(), custom_event_type: g.eventType };
    if (objective === "OUTCOME_LEADS")
      return leadPage ? { page_id: leadPage.id } : undefined;
    if (objective === "OUTCOME_APP_PROMOTION")
      return {
        application_id: g.appId.trim(),
        object_store_url: g.storeUrl.trim(),
      };
    return undefined;
  }
  const page =
    pages.data?.find((p) => p.id === a.pageId) ??
    (pages.data?.length === 1 ? pages.data[0] : undefined);

  useEffect(() => {
    onWide(step === "ad");
  }, [step, onWide]);

  function validate(l: Level): string | null {
    if (created[l]) return null;
    if (l === "campaign") {
      if (!accountDefault) return "Choose a Meta ad account.";
      if (!c.name.trim()) return "Name the campaign.";
      if (c.budgetMode === "campaign") {
        if (!amountOf(c.amount)) return "Enter a campaign budget above zero.";
        if (c.budgetType === "lifetime" && !c.endTime)
          return "A lifetime budget needs an end date.";
      }
      if (c.endTime && !iso(c.endTime)) return "Enter a valid end date.";
      return null;
    }
    if (l === "ad_group") {
      if (req.level === "ad_group" && !parentCampaign)
        return "Choose the campaign for this ad set.";
      if (!g.name.trim()) return "Name the ad set.";
      if (!campaignHasBudget) {
        if (!amountOf(g.amount)) return "Enter an ad set budget above zero.";
        if (g.budgetType === "lifetime" && !g.endTime)
          return "A lifetime budget needs an end date.";
      }
      if (
        g.startTime &&
        g.endTime &&
        new Date(g.endTime) <= new Date(g.startTime)
      )
        return "The end must be after the start.";
      if (g.countries.length + g.locations.length === 0)
        return "Choose at least one country, region or city.";
      if (g.placementsMode === "manual" && g.platforms.length === 0)
        return "Choose at least one platform, or use Advantage+ placements.";
      const strategy = campaignStrategy ?? g.bidStrategy;
      if (
        (strategy === "COST_CAP" || strategy === "LOWEST_COST_WITH_BID_CAP") &&
        !amountOf(g.bidAmount)
      )
        return strategy === "COST_CAP"
          ? "Enter the cost per result goal."
          : "Enter the bid cap.";
      if (strategy === "LOWEST_COST_WITH_MIN_ROAS" && !amountOf(g.roasFloor))
        return "Enter the minimum ROAS.";
      if (g.ageMin > g.ageMax)
        return "The minimum age must be below the maximum.";
      if (g.advantage && g.ageMin > 25)
        return "With Advantage+ audience on, the minimum age must be 25 or lower.";
      if (NEEDS_PROMOTED_OBJECT.has(objective)) {
        if (objective === "OUTCOME_SALES" && !/^\d+$/.test(g.pixelId.trim()))
          return "Enter your Meta pixel ID (digits only).";
        if (objective === "OUTCOME_LEADS" && !leadPage)
          return "Choose the Facebook Page that collects the leads.";
        if (objective === "OUTCOME_APP_PROMOTION") {
          if (!/^\d+$/.test(g.appId.trim()))
            return "Enter the app's Meta application ID.";
          if (!validUrl(g.storeUrl.trim())) return "Enter the app's store URL.";
        }
      }
      return null;
    }
    if (req.level === "ad" && !parentAdGroup)
      return "Choose the ad set for this ad.";
    if (!a.name.trim()) return "Name the ad.";
    if (!page)
      return pages.isError
        ? "Couldn't load your Facebook Pages."
        : "Choose a Facebook Page.";
    if (a.source === "post") {
      if (!/^\d+_\d+$/.test(a.postId.trim()))
        return "Enter the post ID as <pageid>_<postid>.";
      return null;
    }
    if (a.source === "flexible" && !flexibleAllowed)
      return "Meta only allows flexible ads in Sales and App promotion campaigns.";
    const limits = MEDIA_LIMITS[a.source];
    const mp = mediaProblem(media.items, limits.min);
    if (mp) return mp;
    if (media.items.length > limits.max)
      return `This format takes up to ${limits.max} images or videos.`;
    if (!firstText(a.messages)) return "Write the primary text.";
    if (!validUrl(a.link))
      return "Enter a full website link, starting with https://.";
    if (a.source === "carousel") {
      for (const [i, m] of media.items.entries()) {
        const link = a.cards[m.key]?.link.trim();
        if (link && !validUrl(link))
          return `Card ${i + 1}: enter a full link, or leave it blank to use the website link.`;
      }
    }
    if (a.urlTags.trim() && /[\s#]/.test(a.urlTags.trim()))
      return "URL parameters should look like utm_source=meta&utm_medium=paid.";
    return null;
  }

  function placements(): PlacementsInput | null {
    if (g.placementsMode === "auto") return null;
    const out: PlacementsInput = { platforms: g.platforms };
    for (const p of g.platforms) {
      const pos = g.positions[p];
      if (pos?.length) out[`${p}_positions` as keyof Omit<PlacementsInput, "platforms">] = pos;
    }
    return out;
  }

  function mediaFields(m: MediaItem): Pick<AdCreativeInput, "format" | "image_hash" | "video_id"> {
    return m.kind === "video"
      ? { format: "video", video_id: m.videoId }
      : { format: "image", image_hash: m.hash };
  }

  /** The ad inputs to create: one, or one per file for a "several ads" batch. */
  function adInputs(adGroupId: string): CreateAdInput[] {
    const common = {
      ad_group_id: adGroupId,
      status: "paused" as const,
      page_id: page!.id,
      instagram_user_id:
        a.useInstagram && page?.instagram_user_id ? page.instagram_user_id : undefined,
      url_tags: a.urlTags.trim() || undefined,
    };
    if (a.source === "post")
      return [{ ...common, name: a.name.trim(), object_story_id: a.postId.trim() }];
    const text = {
      link: a.link.trim(),
      display_link: a.displayLink.trim() || undefined,
      message: firstText(a.messages),
      headline: firstText(a.headlines),
      description: firstText(a.descriptions),
      call_to_action: a.cta,
    };
    const items = media.items;
    if (a.source === "multi")
      return items.map((m, i) => ({
        ...common,
        name: `${a.name.trim()} ${i + 1}`,
        creative: { ...text, ...mediaFields(m) },
      }));
    let creative: AdCreativeInput;
    if (a.source === "single") creative = { ...text, ...mediaFields(items[0]) };
    else if (a.source === "carousel")
      creative = {
        ...text,
        format: "carousel",
        cards: items.map((m) => ({
          image_hash: m.hash,
          video_id: m.videoId,
          headline: a.cards[m.key]?.headline.trim() || undefined,
          description: a.cards[m.key]?.description.trim() || undefined,
          link: a.cards[m.key]?.link.trim() || undefined,
        })),
      };
    else
      creative = {
        ...text,
        format: "flexible",
        image_hashes: items.filter((m) => m.kind === "image").map((m) => m.hash!),
        video_ids: items.filter((m) => m.kind === "video").map((m) => m.videoId!),
        messages: texts(a.messages),
        headlines: texts(a.headlines),
        descriptions: texts(a.descriptions),
      };
    return [{ ...common, name: a.name.trim(), creative }];
  }

  async function submit(through: Level) {
    const todo = steps.slice(0, steps.indexOf(through) + 1);
    for (const l of todo) {
      const problem = validate(l);
      if (problem) {
        setStep(l);
        setError(problem);
        return;
      }
    }
    setError(null);
    let campaign = parentCampaign;
    let adGroup = parentAdGroup;
    const done: string[] = [];
    for (const l of todo) {
      if (created[l]) continue;
      setSubmitting(l);
      try {
        if (l === "campaign") {
          const amt = c.budgetMode === "campaign" ? amountOf(c.amount) : null;
          const res = await createCampaign.mutateAsync({
            account_id: accountDefault,
            name: c.name.trim(),
            objective: c.objective,
            status: "paused",
            daily_budget: c.budgetType === "daily" ? amt : null,
            lifetime_budget: c.budgetType === "lifetime" ? amt : null,
            end_time: iso(c.endTime),
            bid_strategy:
              c.budgetMode === "campaign" ? c.bidStrategy : "LOWEST_COST_WITHOUT_CAP",
            special_ad_categories: c.special === "NONE" ? [] : [c.special],
          });
          campaign = res.campaign;
          setCreated((x) => ({ ...x, campaign: res.campaign }));
        } else if (l === "ad_group") {
          const amt = campaignHasBudget ? null : amountOf(g.amount);
          const res = await createAdGroup.mutateAsync({
            campaign_id: campaign!.id,
            name: g.name.trim(),
            status: "paused",
            daily_budget:
              !campaignHasBudget && g.budgetType === "daily" ? amt : null,
            lifetime_budget:
              !campaignHasBudget && g.budgetType === "lifetime" ? amt : null,
            start_time: iso(g.startTime),
            end_time: iso(g.endTime),
            optimization_goal: goal.value,
            billing_event: "IMPRESSIONS",
            bid_amount: amountOf(g.bidAmount),
            bid_strategy: campaignHasBudget ? undefined : g.bidStrategy,
            roas_floor:
              (campaignStrategy ?? g.bidStrategy) === "LOWEST_COST_WITH_MIN_ROAS"
                ? amountOf(g.roasFloor)
                : null,
            attribution: g.attribution,
            destination_type: goal.destination,
            promoted_object: promotedObject(),
            targeting: {
              countries: g.countries,
              regions: g.locations.filter((x) => x.type !== "city").map((x) => x.id),
              cities: g.locations
                .filter((x) => x.type === "city")
                .map((x) => ({ key: x.id, radius_km: x.radiusKm ?? 0 })),
              locales: g.languages.map((x) => Number(x.id)),
              age_min: g.ageMin,
              age_max: g.ageMax,
              genders:
                g.gender === "men" ? [1] : g.gender === "women" ? [2] : [],
              advantage_audience: g.advantage,
              interests: g.interests,
              excluded_interests: g.excludedInterests,
              audiences: g.audiences,
              excluded_audiences: g.excludedAudiences,
              placements: placements(),
            },
          });
          adGroup = res.ad_group;
          setCreated((x) => ({ ...x, ad_group: res.ad_group }));
        } else {
          const inputs = adInputs(adGroup!.id);
          let last: Ad | undefined;
          for (let i = multiDone; i < inputs.length; i++) {
            const res = await createAd.mutateAsync(inputs[i]);
            last = res.ad;
            setMultiDone(i + 1);
          }
          const res = { ad: last! };
          setCreated((x) => ({ ...x, ad: res.ad }));
        }
        done.push(STEP_LABEL[l].toLowerCase());
      } catch (e) {
        setSubmitting(null);
        setStep(l);
        setError((e as Error).message);
        errorToast(
          `Couldn't create the ${STEP_LABEL[l].toLowerCase()}`,
          e,
          done.length
            ? `(The ${done.join(" and ")} ${done.length > 1 ? "were" : "was"} created, paused.)`
            : undefined,
        );
        return;
      }
    }
    setSubmitting(null);
    const adCount = a.source === "multi" ? media.items.length : 1;
    toast.success(
      `Created ${todo
        .map((l) =>
          l === "ad" && adCount > 1 ? `${adCount} ads` : STEP_LABEL[l].toLowerCase(),
        )
        .join(", ")}, paused`,
      {
        description: "Nothing spends until you turn it on.",
      },
    );
    onClose();
  }

  const idx = steps.indexOf(step);
  const next = steps[idx + 1];
  const busy = submitting !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="gap-3 border-b border-border px-5 py-4 pr-12">
        <SheetTitle className="text-base font-semibold text-fg">
          Create{" "}
          {steps.length > 1 ? "on Meta" : STEP_LABEL[req.level].toLowerCase()}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Set up a paused Meta campaign, ad set and ad.
        </SheetDescription>
        {steps.length > 1 && (
          <ol className="flex items-center gap-1 text-xs" aria-label="Steps">
            {steps.map((l, i) => {
              const isDone = !!created[l];
              const isCur = l === step;
              return (
                <li key={l} className="flex items-center gap-1">
                  {i > 0 && (
                    <span aria-hidden="true" className="h-px w-6 bg-border" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStep(l);
                      setError(null);
                    }}
                    aria-current={isCur ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors",
                      isCur
                        ? "bg-accent text-accent-fg"
                        : "text-fg-muted hover:text-fg",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 place-items-center rounded-full text-[10px]",
                        isDone
                          ? "bg-success text-on-status"
                          : isCur
                            ? "bg-primary text-primary-fg"
                            : "bg-bg-subtle text-fg-muted",
                      )}
                    >
                      {isDone ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    {STEP_LABEL[l]}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {created[step] ? (
          <p className="flex items-center gap-2 rounded-md bg-success-subtle px-3 py-2 text-sm text-success-fg">
            <Check className="size-4" aria-hidden="true" /> Created “
            {created[step]!.name}” (paused).
          </p>
        ) : step === "campaign" ? (
          <CampaignStep
            d={c}
            set={setC}
            accountId={accountDefault}
            accounts={metaAccounts}
            accountsLoading={accounts.isPending}
            currency={currency}
          />
        ) : step === "ad_group" ? (
          <AdGroupStep
            d={g}
            set={setG}
            pickCampaign={req.level === "ad_group"}
            campaigns={(metaCampaigns.data?.rows ?? []).filter(
              (x) => x.status !== "archived" && x.status !== "deleted",
            )}
            campaignsLoading={metaCampaigns.isPending}
            parent={parentCampaign}
            campaignHasBudget={campaignHasBudget}
            newCampaignBudget={
              req.level === "campaign"
                ? { mode: c.budgetType, amount: amountOf(c.amount) }
                : null
            }
            currency={currency}
            goals={goals}
            goal={goal.value}
            objective={objective}
            pages={pages}
            leadPageId={leadPage?.id ?? ""}
            orgId={orgId}
            accountId={accountId}
            campaignStrategy={campaignStrategy}
          />
        ) : (
          <AdStep
            d={a}
            set={setA}
            pickAdGroup={req.level === "ad"}
            adGroups={(metaAdGroups.data?.rows ?? []).filter(
              (x) => x.status !== "archived" && x.status !== "deleted",
            )}
            adGroupsLoading={metaAdGroups.isPending}
            pages={pages}
            page={page}
            media={media}
            flexibleAllowed={flexibleAllowed}
            accountReady={!!accountId}
          />
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-fg"
          >
            {error}
          </p>
        )}
      </div>

      <SheetFooter className="flex-col gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-fg-muted">
          <Info className="size-3.5" aria-hidden="true" /> Created paused.
          Nothing spends until you turn it on.
        </p>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {idx > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setStep(steps[idx - 1])}
            >
              Back
            </Button>
          )}
          {next ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void submit(step)}
              >
                {submitting && (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                )}
                Create {STEP_LABEL[step].toLowerCase()} only
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const problem = validate(step);
                  if (problem) setError(problem);
                  else {
                    setError(null);
                    setStep(next);
                  }
                }}
              >
                Next: {STEP_LABEL[next]}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void submit("ad")}
            >
              {submitting && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              {submitting
                ? `Creating ${STEP_LABEL[submitting].toLowerCase()}…`
                : steps.length > 1
                  ? "Create all, paused"
                  : "Create ad, paused"}
            </Button>
          )}
        </div>
      </SheetFooter>
    </div>
  );
}

// --- Steps ---

function F({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

function BudgetInputs({
  idPrefix,
  type,
  amount,
  currency,
  onType,
  onAmount,
}: {
  idPrefix: string;
  type: "daily" | "lifetime";
  amount: string;
  currency: string;
  onType: (t: "daily" | "lifetime") => void;
  onAmount: (s: string) => void;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-end gap-2">
      <F label="Budget type" htmlFor={`${idPrefix}-type`}>
        <Select
          value={type}
          onValueChange={(v) => onType(v as "daily" | "lifetime")}
        >
          <SelectTrigger id={`${idPrefix}-type`} size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="lifetime">Lifetime</SelectItem>
          </SelectContent>
        </Select>
      </F>
      <F
        label={currency ? `Amount (${currency})` : "Amount"}
        htmlFor={`${idPrefix}-amount`}
      >
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          placeholder={type === "daily" ? "500" : "15000"}
          className="h-8 tabular-nums"
        />
      </F>
    </div>
  );
}

function CampaignStep({
  d,
  set,
  accountId,
  accounts,
  accountsLoading,
  currency,
}: {
  d: CampaignDraft;
  set: React.Dispatch<React.SetStateAction<CampaignDraft>>;
  accountId: string;
  accounts: { id: string; name: string; currency: string }[];
  accountsLoading: boolean;
  currency: string;
}) {
  const up = (p: Partial<CampaignDraft>) => set((x) => ({ ...x, ...p }));
  return (
    <div className="grid gap-4">
      <F label="Ad account" htmlFor="c-account">
        <Select
          value={accountId}
          onValueChange={(v) => up({ accountId: v })}
          disabled={accountsLoading}
        >
          <SelectTrigger id="c-account" size="sm" className="w-full">
            <SelectValue
              placeholder={
                accountsLoading
                  ? "Loading…"
                  : accounts.length
                    ? "Choose a Meta ad account"
                    : "No Meta ad accounts connected"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.name} <span className="text-fg-muted">· {x.currency}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </F>
      <F label="Campaign name" htmlFor="c-name">
        <Input
          id="c-name"
          value={d.name}
          onChange={(e) => up({ name: e.target.value })}
          placeholder="e.g. Diwali sale – Traffic"
          className="h-8"
          autoFocus
        />
      </F>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-xs font-medium">Objective</legend>
        <div
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
          role="radiogroup"
        >
          {OBJECTIVES.map((o) => {
            const on = d.objective === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => up({ objective: o.value })}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-bg-subtle",
                )}
              >
                <span className="block text-sm font-medium text-fg">
                  {o.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">
                  {o.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-medium">Budget</legend>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={d.budgetMode}
          onValueChange={(v) =>
            v && up({ budgetMode: v as CampaignDraft["budgetMode"] })
          }
          className="w-full"
        >
          <ToggleGroupItem value="campaign" className="flex-1 text-xs">
            Campaign budget
          </ToggleGroupItem>
          <ToggleGroupItem value="ad_set" className="flex-1 text-xs">
            Ad set budgets
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-fg-subtle">
          {d.budgetMode === "campaign"
            ? "Advantage campaign budget: Meta spreads one budget across the ad sets."
            : "Each ad set gets its own budget, set in the next step."}
        </p>
        {d.budgetMode === "campaign" && (
          <>
            <BudgetInputs
              idPrefix="c-budget"
              type={d.budgetType}
              amount={d.amount}
              currency={currency}
              onType={(t) => up({ budgetType: t })}
              onAmount={(s) => up({ amount: s })}
            />
            <F
              label="Bid strategy"
              htmlFor="c-bid"
              hint={BID_STRATEGIES.find((b) => b.value === d.bidStrategy)?.hint}
            >
              <Select
                value={d.bidStrategy}
                onValueChange={(v) => up({ bidStrategy: v as BidStrategy })}
              >
                <SelectTrigger id="c-bid" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BID_STRATEGIES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          </>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <F
          label={
            d.budgetMode === "campaign" && d.budgetType === "lifetime"
              ? "End date (required)"
              : "End date (optional)"
          }
          htmlFor="c-end"
        >
          <Input
            id="c-end"
            type="datetime-local"
            value={d.endTime}
            onChange={(e) => up({ endTime: e.target.value })}
            className="h-8"
          />
        </F>
        <F label="Special ad category" htmlFor="c-special">
          <Select value={d.special} onValueChange={(v) => up({ special: v })}>
            <SelectTrigger id="c-special" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPECIAL_CATEGORIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
      </div>
    </div>
  );
}

function AdGroupStep({
  d,
  set,
  pickCampaign,
  campaigns,
  campaignsLoading,
  parent,
  campaignHasBudget,
  newCampaignBudget,
  currency,
  goals,
  goal,
  objective,
  pages,
  leadPageId,
  orgId,
  accountId,
  campaignStrategy,
}: {
  objective: string;
  pages: ReturnType<typeof usePages>;
  leadPageId: string;
  orgId: string;
  accountId: string | undefined;
  campaignStrategy: BidStrategy | "unknown" | null;
  d: AdGroupDraft;
  set: React.Dispatch<React.SetStateAction<AdGroupDraft>>;
  pickCampaign: boolean;
  campaigns: Campaign[];
  campaignsLoading: boolean;
  parent: Campaign | undefined;
  campaignHasBudget: boolean;
  newCampaignBudget: {
    mode: "daily" | "lifetime";
    amount: number | null;
  } | null;
  currency: string;
  goals: { value: string; label: string }[];
  goal: string;
}) {
  const up = (p: Partial<AdGroupDraft>) => set((x) => ({ ...x, ...p }));
  const parentBudget = newCampaignBudget
    ? newCampaignBudget.amount != null
      ? `${formatMoney(newCampaignBudget.amount, currency)} ${newCampaignBudget.mode === "daily" ? "a day" : "in total"}`
      : "the campaign budget"
    : parent
      ? budgetPhrase(parent, parent.currency)
      : null;
  return (
    <div className="grid gap-4">
      {pickCampaign && (
        <F label="Campaign" htmlFor="g-campaign">
          <Select
            value={d.campaignId}
            onValueChange={(v) => up({ campaignId: v })}
            disabled={campaignsLoading}
          >
            <SelectTrigger id="g-campaign" size="sm" className="w-full">
              <SelectValue
                placeholder={
                  campaignsLoading ? "Loading…" : "Choose a Meta campaign"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
      )}
      <F label="Ad set name" htmlFor="g-name">
        <Input
          id="g-name"
          value={d.name}
          onChange={(e) => up({ name: e.target.value })}
          placeholder="e.g. India 18–45"
          className="h-8"
          autoFocus
        />
      </F>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-medium">
          Budget and schedule
        </legend>
        {campaignHasBudget ? (
          <p className="text-xs text-fg-muted">
            Uses the campaign budget{parentBudget ? ` (${parentBudget})` : ""}.
          </p>
        ) : (
          <BudgetInputs
            idPrefix="g-budget"
            type={d.budgetType}
            amount={d.amount}
            currency={currency}
            onType={(t) => up({ budgetType: t })}
            onAmount={(s) => up({ amount: s })}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <F
            label="Start (optional)"
            htmlFor="g-start"
            hint="Blank starts as soon as it's turned on."
          >
            <Input
              id="g-start"
              type="datetime-local"
              value={d.startTime}
              onChange={(e) => up({ startTime: e.target.value })}
              className="h-8"
            />
          </F>
          <F
            label={
              !campaignHasBudget && d.budgetType === "lifetime"
                ? "End (required)"
                : "End (optional)"
            }
            htmlFor="g-end"
          >
            <Input
              id="g-end"
              type="datetime-local"
              value={d.endTime}
              onChange={(e) => up({ endTime: e.target.value })}
              className="h-8"
            />
          </F>
        </div>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1.5 text-xs font-medium">Audience</legend>
        <F
          label={d.locations.length ? "Countries (optional)" : "Countries"}
          htmlFor="g-countries"
        >
          <CountryPicker
            id="g-countries"
            value={d.countries}
            onChange={(v) => up({ countries: v })}
          />
        </F>
        <LocationSearch
          orgId={orgId}
          accountId={accountId}
          value={d.locations}
          onChange={(v) => up({ locations: v })}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <F label="Min age" htmlFor="g-agemin">
            <Select
              value={String(d.ageMin)}
              onValueChange={(v) => up({ ageMin: Number(v) })}
            >
              <SelectTrigger id="g-agemin" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Max age" htmlFor="g-agemax">
            <Select
              value={String(d.ageMax)}
              onValueChange={(v) => up({ ageMax: Number(v) })}
            >
              <SelectTrigger id="g-agemax" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 65 ? "65+" : n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Gender" className="col-span-2 sm:col-span-1">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={d.gender}
              onValueChange={(v) =>
                v && up({ gender: v as AdGroupDraft["gender"] })
              }
              aria-label="Gender"
              className="w-full"
            >
              <ToggleGroupItem value="all" className="flex-1 text-xs">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="men" className="flex-1 text-xs">
                Men
              </ToggleGroupItem>
              <ToggleGroupItem value="women" className="flex-1 text-xs">
                Women
              </ToggleGroupItem>
            </ToggleGroup>
          </F>
        </div>
        <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
          <Switch
            checked={d.advantage}
            onCheckedChange={(v) => up({ advantage: v })}
            className="mt-0.5"
            aria-label="Advantage+ audience"
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium text-fg">
              Advantage+ audience
            </span>
            <span className="text-xs text-fg-muted">
              Let Meta reach beyond these settings when it expects better
              results. While on, Meta needs a minimum age of 25 or lower and
              treats the maximum age and interests as suggestions (it can reach
              people up to 65+).
            </span>
          </span>
        </label>
        <TargetingSearch
          orgId={orgId}
          accountId={accountId}
          kind="languages"
          label="Languages (optional)"
          placeholder="All languages. Search to limit…"
          value={d.languages}
          onChange={(v) => up({ languages: v })}
        />
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1.5 text-xs font-medium">
          Detailed targeting
        </legend>
        <TargetingSearch
          orgId={orgId}
          accountId={accountId}
          kind="interests"
          label="Include people who match any of these"
          placeholder="Search interests, behaviours, demographics…"
          value={d.interests}
          onChange={(v) => up({ interests: v })}
        />
        <TargetingSearch
          orgId={orgId}
          accountId={accountId}
          kind="interests"
          tone="exclude"
          label="Exclude people who match"
          placeholder="Search to exclude…"
          value={d.excludedInterests}
          onChange={(v) => up({ excludedInterests: v })}
        />
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-medium">
          Custom and lookalike audiences
        </legend>
        <AudiencePicker
          orgId={orgId}
          accountId={accountId}
          include={d.audiences}
          exclude={d.excludedAudiences}
          onChange={(inc, exc) => up({ audiences: inc, excludedAudiences: exc })}
        />
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-medium">Placements</legend>
        <PlacementsPicker d={d} up={up} />
      </fieldset>
      {objective === "OUTCOME_SALES" && (
        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-xs font-medium">
            Conversion tracking (required for Sales)
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <F
              label="Meta pixel ID"
              htmlFor="g-pixel"
              hint="Events Manager → Data sources."
            >
              <Input
                id="g-pixel"
                inputMode="numeric"
                value={d.pixelId}
                onChange={(e) => up({ pixelId: e.target.value })}
                placeholder="123456789012345"
                className="h-8 font-mono"
              />
            </F>
            <F label="Conversion event" htmlFor="g-event">
              <Select
                value={d.eventType}
                onValueChange={(v) => up({ eventType: v })}
              >
                <SelectTrigger id="g-event" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIXEL_EVENTS.map((x) => (
                    <SelectItem key={x.value} value={x.value}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          </div>
        </fieldset>
      )}
      {objective === "OUTCOME_LEADS" && (
        <F
          label="Page that collects leads (required for Leads)"
          htmlFor="g-leadpage"
          hint={
            pages.isError ? (
              <span className="text-danger-fg">{pages.error.message}</span>
            ) : undefined
          }
        >
          <Select
            value={leadPageId}
            onValueChange={(v) => up({ leadPageId: v })}
            disabled={pages.isPending || pages.isError}
          >
            <SelectTrigger id="g-leadpage" size="sm" className="w-full">
              <SelectValue
                placeholder={
                  pages.isPending
                    ? "Loading Pages…"
                    : pages.isError
                      ? "Couldn't load Pages"
                      : "Choose a Page"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(pages.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
      )}
      {objective === "OUTCOME_APP_PROMOTION" && (
        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-xs font-medium">
            App (required for App promotion)
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Meta application ID" htmlFor="g-app">
              <Input
                id="g-app"
                inputMode="numeric"
                value={d.appId}
                onChange={(e) => up({ appId: e.target.value })}
                className="h-8 font-mono"
              />
            </F>
            <F label="App store URL" htmlFor="g-store">
              <Input
                id="g-store"
                type="url"
                value={d.storeUrl}
                onChange={(e) => up({ storeUrl: e.target.value })}
                placeholder="https://play.google.com/store/apps/details?id=…"
                className="h-8"
              />
            </F>
          </div>
        </fieldset>
      )}
      <F
        label="Optimise for"
        htmlFor="g-goal"
        hint="Defaults to what fits the campaign objective."
      >
        <Select value={goal} onValueChange={(v) => up({ goal: v })}>
          <SelectTrigger id="g-goal" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {goals.map((x) => (
              <SelectItem key={x.value} value={x.value}>
                {x.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </F>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-medium">Bidding</legend>
        <BiddingFields
          d={d}
          up={up}
          currency={currency}
          campaignStrategy={campaignStrategy}
        />
      </fieldset>
    </div>
  );
}

const SOURCES: { value: AdSource; label: string }[] = [
  { value: "single", label: "Single image or video" },
  { value: "carousel", label: "Carousel" },
  { value: "flexible", label: "Flexible" },
  { value: "multi", label: "Several ads" },
  { value: "post", label: "Existing post" },
];

const SOURCE_HINT: Record<AdSource, string> = {
  single: "One image (JPG/PNG, 1080×1080 works best) or video (MP4/MOV).",
  carousel: "2–10 cards people swipe through, each with its own headline and link.",
  flexible:
    "Up to 10 images or videos and up to 5 of each text. Meta shows each person the combination most likely to work.",
  multi: "One separate ad per image or video, in this ad set, so you can see which one wins.",
  post: "",
};

const textareaCls =
  "min-h-16 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/** One text field, or up to five variations of it for flexible ads. */
function TextVariants({
  id,
  label,
  values,
  onChange,
  multi,
  area,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  multi: boolean;
  area?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const shown = multi ? values : values.slice(0, 1);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-0`} className="text-xs">
        {label}
        {multi && values.length > 1 ? ` (${values.length} options)` : ""}
      </Label>
      {shown.map((v, i) => (
        <div key={i} className="flex items-start gap-1.5">
          {area ? (
            <textarea
              id={`${id}-${i}`}
              value={v}
              onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
              rows={i === 0 ? 3 : 2}
              placeholder={i === 0 ? placeholder : "Another option"}
              className={textareaCls}
            />
          ) : (
            <Input
              id={`${id}-${i}`}
              value={v}
              onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={maxLength}
              placeholder={i === 0 ? placeholder : "Another option"}
              className="h-8"
            />
          )}
          {multi && i > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              aria-label={`Remove ${label.toLowerCase()} option ${i + 1}`}
            >
              ×
            </Button>
          )}
        </div>
      ))}
      {multi && values.length < 5 && (
        <button
          type="button"
          onClick={() => onChange([...values, ""])}
          className="justify-self-start text-xs font-medium text-primary hover:underline"
        >
          + Add option
        </button>
      )}
    </div>
  );
}

function AdStep({
  d,
  set,
  pickAdGroup,
  adGroups,
  adGroupsLoading,
  pages,
  page,
  media,
  flexibleAllowed,
  accountReady,
}: {
  d: AdDraft;
  set: React.Dispatch<React.SetStateAction<AdDraft>>;
  pickAdGroup: boolean;
  adGroups: AdGroup[];
  adGroupsLoading: boolean;
  pages: ReturnType<typeof usePages>;
  page:
    | { id: string; name: string; picture_url: string; instagram_user_id?: string; instagram_username?: string }
    | undefined;
  media: ReturnType<typeof useAdMedia>;
  flexibleAllowed: boolean;
  accountReady: boolean;
}) {
  const up = (p: Partial<AdDraft>) => set((x) => ({ ...x, ...p }));
  const groupedAdGroups = useMemo(() => adGroups, [adGroups]);
  const upCard = (key: string, p: Partial<CardText>) =>
    set((x) => ({
      ...x,
      cards: {
        ...x.cards,
        [key]: { ...{ headline: "", description: "", link: "" }, ...x.cards[key], ...p },
      },
    }));
  const limits = d.source === "post" ? null : MEDIA_LIMITS[d.source];
  const first = media.items[0];
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]">
      <div className="grid content-start gap-4">
        {pickAdGroup && (
          <F label="Ad set" htmlFor="a-adgroup">
            <Select
              value={d.adGroupId}
              onValueChange={(v) => up({ adGroupId: v })}
              disabled={adGroupsLoading}
            >
              <SelectTrigger id="a-adgroup" size="sm" className="w-full">
                <SelectValue
                  placeholder={
                    adGroupsLoading ? "Loading…" : "Choose a Meta ad set"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {groupedAdGroups.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}{" "}
                    <span className="text-fg-muted">· {x.campaign_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <F
            label={d.source === "multi" ? "Ad name (numbered per file)" : "Ad name"}
            htmlFor="a-name"
          >
            <Input
              id="a-name"
              value={d.name}
              onChange={(e) => up({ name: e.target.value })}
              placeholder="e.g. Owl creative"
              className="h-8"
              autoFocus
            />
          </F>
          <F
            label="Facebook Page"
            htmlFor="a-page"
            hint={
              pages.isError ? (
                <span className="text-danger-fg">{pages.error.message}</span>
              ) : undefined
            }
          >
            <Select
              value={page?.id ?? ""}
              onValueChange={(v) => up({ pageId: v })}
              disabled={!accountReady || pages.isPending || pages.isError}
            >
              <SelectTrigger id="a-page" size="sm" className="w-full">
                <SelectValue
                  placeholder={
                    !accountReady
                      ? "Choose the account first"
                      : pages.isPending
                        ? "Loading Pages…"
                        : pages.isError
                          ? "Couldn't load Pages"
                          : pages.data?.length
                            ? "Choose a Page"
                            : "No Pages available"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(pages.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
        </div>
        {page && (
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Switch
              checked={d.useInstagram && !!page.instagram_user_id}
              onCheckedChange={(v) => up({ useInstagram: v })}
              disabled={!page.instagram_user_id}
              aria-label="Show on Instagram as the linked account"
            />
            {page.instagram_user_id
              ? `On Instagram, show as @${page.instagram_username ?? "linked account"}`
              : "No Instagram account is linked to this Page; Instagram ads show as the Page."}
          </label>
        )}

        <div className="grid gap-1.5">
          <span className="text-xs font-medium">Format</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ad format">
            {SOURCES.map((o) => {
              const on = d.source === o.value;
              const off = o.value === "flexible" && !flexibleAllowed;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={off}
                  title={off ? "Meta only allows flexible ads in Sales and App promotion campaigns" : undefined}
                  onClick={() => {
                    if (o.value !== "post") media.trim(MEDIA_LIMITS[o.value].max);
                    up({ source: o.value });
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                    on ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:text-fg",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {d.source === "post" ? (
          <F
            label="Post ID"
            htmlFor="a-post"
            hint="Format: <pageid>_<postid>. Find it in the post's link on Facebook."
          >
            <Input
              id="a-post"
              value={d.postId}
              onChange={(e) => up({ postId: e.target.value })}
              placeholder="1234567890_9876543210"
              className="h-8 font-mono"
            />
          </F>
        ) : (
          <>
            <MediaGrid
              items={media.items}
              max={limits!.max}
              videos
              disabled={!accountReady}
              hint={SOURCE_HINT[d.source]}
              onAdd={(files) => media.add(files, { max: limits!.max, videos: true })}
              onRemove={media.remove}
            />
            {d.source === "carousel" && media.items.length > 0 && (
              <ol className="grid gap-2">
                {media.items.map((m, i) => (
                  <li key={m.key} className="grid gap-2 rounded-md border border-border p-2.5">
                    <span className="text-xs font-medium text-fg-muted">
                      Card {i + 1} · {m.fileName}
                    </span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        aria-label={`Card ${i + 1} headline`}
                        value={d.cards[m.key]?.headline ?? ""}
                        onChange={(e) => upCard(m.key, { headline: e.target.value })}
                        placeholder="Headline"
                        maxLength={255}
                        className="h-8"
                      />
                      <Input
                        aria-label={`Card ${i + 1} description`}
                        value={d.cards[m.key]?.description ?? ""}
                        onChange={(e) => upCard(m.key, { description: e.target.value })}
                        placeholder="Description (optional)"
                        maxLength={255}
                        className="h-8"
                      />
                    </div>
                    <Input
                      aria-label={`Card ${i + 1} link`}
                      type="url"
                      value={d.cards[m.key]?.link ?? ""}
                      onChange={(e) => upCard(m.key, { link: e.target.value })}
                      placeholder="Link (optional, defaults to the website link)"
                      className="h-8"
                    />
                  </li>
                ))}
              </ol>
            )}
            <TextVariants
              id="a-message"
              label="Primary text"
              values={d.messages}
              onChange={(v) => up({ messages: v })}
              multi={d.source === "flexible"}
              area
              placeholder="Tell people what your ad is about"
            />
            {d.source !== "carousel" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextVariants
                  id="a-headline"
                  label="Headline"
                  values={d.headlines}
                  onChange={(v) => up({ headlines: v })}
                  multi={d.source === "flexible"}
                  maxLength={255}
                />
                <TextVariants
                  id="a-desc"
                  label="Description (optional)"
                  values={d.descriptions}
                  onChange={(v) => up({ descriptions: v })}
                  multi={d.source === "flexible"}
                  maxLength={255}
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <F label="Website link" htmlFor="a-link">
                <Input
                  id="a-link"
                  type="url"
                  value={d.link}
                  onChange={(e) => up({ link: e.target.value })}
                  className="h-8"
                />
              </F>
              <F label="Call to action" htmlFor="a-cta">
                <Select
                  value={d.cta}
                  onValueChange={(v) => up({ cta: v as CallToAction })}
                >
                  <SelectTrigger id="a-cta" size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTAS.map((x) => (
                      <SelectItem key={x.value} value={x.value}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
            </div>
            <F
              label="Display link (optional)"
              htmlFor="a-display"
              hint="Shown instead of the website's domain, e.g. shop.example.com/sale."
            >
              <Input
                id="a-display"
                value={d.displayLink}
                onChange={(e) => up({ displayLink: e.target.value })}
                maxLength={100}
                className="h-8"
              />
            </F>
          </>
        )}
        <F
          label="URL parameters (optional)"
          htmlFor="a-utm"
          hint="Added to every link so your analytics can tell these visits apart."
        >
          <Input
            id="a-utm"
            value={d.urlTags}
            onChange={(e) => up({ urlTags: e.target.value })}
            placeholder="utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}"
            className="h-8 font-mono text-xs"
          />
        </F>
      </div>
      <div className="grid content-start gap-2 md:sticky md:top-0">
        <span className="text-xs font-medium text-fg-muted">Preview</span>
        <AdPreview
          pageName={page?.name}
          pagePicture={page?.picture_url}
          imageUrl={first?.kind === "image" ? first.previewUrl : null}
          videoUrl={first?.kind === "video" ? first.previewUrl : null}
          count={d.source === "carousel" || d.source === "flexible" ? media.items.length : undefined}
          message={firstText(d.messages)}
          headline={
            d.source === "carousel" && first
              ? (d.cards[first.key]?.headline ?? "")
              : firstText(d.headlines)
          }
          description={
            d.source === "carousel" && first
              ? (d.cards[first.key]?.description ?? "")
              : firstText(d.descriptions)
          }
          link={d.displayLink || d.link}
          cta={d.cta}
          postId={d.source === "post" ? d.postId || "—" : undefined}
        />
        {d.source === "multi" && media.items.length > 1 && (
          <p className="text-xs text-fg-subtle">
            Previewing the first of {media.items.length} ads.
          </p>
        )}
      </div>
    </div>
  );
}
