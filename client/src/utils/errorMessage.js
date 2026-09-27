// The API's own message for a failed request (e.g. "Name is required"),
// falling back to a generic one for network errors.
export const errorMessage = (error, fallback = "Something went wrong") =>
  error?.response?.data?.message || fallback;
