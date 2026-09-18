"use client";

// Submit button for the delete form that asks for confirmation first,
// since deletion is permanent.
export function DeletePropertyButton({
  propertyName,
}: {
  propertyName: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (
          !window.confirm(
            `Remove "${propertyName}"? This cannot be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
      className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
    >
      Remove property
    </button>
  );
}
