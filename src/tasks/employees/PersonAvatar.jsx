import { useEffect, useState } from "react";
import { supabase } from "../../supabase";
import { avatarBucket } from "./avatar";
import { initials } from "../organization/model";
// Employee avatar with signed-URL loading and initials fallback. Shared by the organisation chart,
// task lists, the task workspace and notifications. `size` is the pixel diameter.
export default function PersonAvatar({ person, size }) {
  const [url, setUrl] = useState(null),
    [failed, setFailed] = useState(null);
  useEffect(() => {
    let live = true;
    if (person?.avatar_path) {
      supabase.storage
        .from(avatarBucket)
        .createSignedUrl(person.avatar_path, 300)
        .then(({ data }) => {
          if (live)
            setUrl({ path: person.avatar_path, value: data?.signedUrl });
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [person?.avatar_path]);
  if (!person) return null;
  const source = person.avatar_path
    ? url?.path === person.avatar_path
      ? url.value
      : null
    : person.avatar_url;
  const style = size ? { flexBasis: size, width: size, height: size, fontSize: size * 0.38 } : undefined;
  return (
    <span className="org-avatar" aria-hidden="true" style={style}>
      {source && failed !== source ? (
        <img src={source} alt="" style={style} onError={() => setFailed(source)} />
      ) : (
        initials(person.name)
      )}
    </span>
  );
}
