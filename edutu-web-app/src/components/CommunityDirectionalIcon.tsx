import { ArrowLeft, type LucideProps } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function CommunityDirectionalIcon(props: LucideProps) {
  const { i18n } = useTranslation();
  const direction = i18n.dir();

  return (
    <ArrowLeft
      {...props}
      aria-hidden={props["aria-label"] ? undefined : true}
      style={{
        ...props.style,
        transform: direction === "rtl" ? "rotate(180deg)" : "none",
        transition: "transform 120ms ease",
      }}
    />
  );
}
