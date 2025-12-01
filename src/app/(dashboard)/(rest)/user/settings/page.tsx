import { EntityContainer, EntityHeader } from "@/components/entity-components";

const Page = () => {
  return (
    <EntityContainer
      header={
        <EntityHeader
          title="User API Tokens"
          description="Manage API tokens"
          newButtonLabel="New token"
        />
      }
    >
      <p>TODO</p>
    </EntityContainer>
  );
};

export default Page;
