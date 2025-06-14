"use client";
import { useEffect, useState } from "react";
import CardStat from "@/components/CardStat";
import EngagementLineChart from "@/components/EngagementLineChart";
import EngagementByTypeChart from "@/components/EngagementByTypeChart";
import HeatmapTable from "@/components/HeatmapTable";
import PostMetricsChart from "@/components/PostMetricsChart";
import InstagramPostsGrid from "@/components/InstagramPostsGrid";
import Loader from "@/components/Loader";
import {
  getInstagramProfileViaBackend,
  getInstagramPostsViaBackend,
  getClientProfile,
} from "@/utils/api";

export default function InstagramPostAnalysisPage() {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("cicero_token") : null;
    const clientId =
      typeof window !== "undefined" ? localStorage.getItem("client_id") : null;

    if (!token || !clientId) {
      setError("Token / Client ID tidak ditemukan. Silakan login ulang.");
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        const clientProfile = await getClientProfile(token, clientId);
        const username =
          clientProfile.client?.client_insta?.replace(/^@/, "") ||
          clientProfile.client_insta?.replace(/^@/, "") ||
          process.env.NEXT_PUBLIC_INSTAGRAM_USER ||
          "instagram";

        const profileRes = await getInstagramProfileViaBackend(token, username);
        setProfile(profileRes.data || profileRes.profile || profileRes);

        const postRes = await getInstagramPostsViaBackend(token, username, 50);
        const postData = postRes.data || postRes.posts || postRes;
        setPosts(Array.isArray(postData) ? postData : []);
      } catch (err) {
        setError("Gagal mengambil data: " + (err.message || err));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <Loader />;
  if (error)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-md p-6 text-red-500 font-bold">
          {error}
        </div>
      </div>
    );
  if (!profile) return null;

  const sortedPosts = [...posts].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const firstDate = sortedPosts.length
    ? new Date(sortedPosts[0].created_at)
    : new Date();
  const lastDate = sortedPosts.length
    ? new Date(sortedPosts[sortedPosts.length - 1].created_at)
    : new Date();
  const diffDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24) || 1;
  const postingFreq = (sortedPosts.length / diffDays).toFixed(2);
  const followerRatio = profile.followers
    ? (profile.followers / profile.following).toFixed(2)
    : "0";

  const hashtagMap = {};
  const mentionMap = {};
  const lineData = [];
  const typeMap = {};
  const heatmap = {};
  const buckets = ["0-5", "6-11", "12-17", "18-23"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  sortedPosts.forEach((p) => {
    const eng =
      ((p.like_count + p.comment_count + p.share_count) / profile.followers) *
      100;
    lineData.push({
      date: new Date(p.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      rate: parseFloat(eng.toFixed(2)),
    });

    if (!typeMap[p.type]) typeMap[p.type] = { total: 0, count: 0 };
    typeMap[p.type].total += eng;
    typeMap[p.type].count += 1;

    const tags = p.caption.match(/#\w+/g) || [];
    tags.forEach((t) => {
      hashtagMap[t] = (hashtagMap[t] || 0) + 1;
    });
    const mentions = p.caption.match(/@\w+/g) || [];
    mentions.forEach((m) => {
      mentionMap[m] = (mentionMap[m] || 0) + 1;
    });

    const d = new Date(p.created_at);
    const day = dayNames[d.getDay()];
    const bucket = buckets[Math.floor(d.getHours() / 6)];
    if (!heatmap[day]) heatmap[day] = {};
    if (!heatmap[day][bucket]) heatmap[day][bucket] = 0;
    heatmap[day][bucket] += eng / 10;
  });

  const typeData = Object.entries(typeMap).map(([type, v]) => ({
    type,
    engagement: parseFloat((v.total / v.count).toFixed(2)),
  }));

  const topHashtags = Object.entries(hashtagMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topMentions = Object.entries(mentionMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8">
      <div className="w-full max-w-5xl flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-blue-700">Instagram Post Analysis</h1>
        <p className="text-gray-600">Analisis performa postingan Instagram.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CardStat title="Followers" value={profile.followers} />
          <CardStat title="Following" value={profile.following} />
          <CardStat title="Follower/Following" value={followerRatio} />
          <CardStat title="Posts / Day" value={postingFreq} />
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-2">Engagement Trend</h2>
          <EngagementLineChart data={lineData} />
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-2">Engagement by Content Type</h2>
          <EngagementByTypeChart data={typeData} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow">
            <h3 className="font-semibold mb-2">Top Hashtags</h3>
            <ul className="list-disc ml-5 text-sm">
              {topHashtags.map(([t, c]) => (
                <li key={t}>{t} - {c}x</li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-4 rounded-xl shadow">
            <h3 className="font-semibold mb-2">Top Mentions</h3>
            <ul className="list-disc ml-5 text-sm">
              {topMentions.map(([m, c]) => (
                <li key={m}>{m} - {c}x</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h3 className="font-semibold mb-2">Posting Time Heatmap</h3>
          <HeatmapTable data={heatmap} days={dayNames} buckets={buckets} />
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h3 className="font-semibold mb-2">Posts Overview</h3>
          <InstagramPostsGrid posts={sortedPosts} />
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h3 className="font-semibold mb-2">Post Metrics Comparison</h3>
          <PostMetricsChart posts={sortedPosts} />
        </div>
      </div>
    </div>
  );
}
