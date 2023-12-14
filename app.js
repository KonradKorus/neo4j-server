const express = require('express');
const neo4j = require('neo4j-driver');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

const uri = 'neo4j+s://285208b4.databases.neo4j.io';
const user = 'neo4j';
const password = '2nqG22mYqkDdqx3BlEWHZ6mUaNgwuN6NpDtVD34WYPA';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

app.use(express.json());
app.use(bodyParser.json());
app.use(cors());

const session = driver.session();
const session2 = driver.session();

app.get('/api/employees', async (req, res) => {
  try {
    const result = await session.run('MATCH (p:Person) RETURN p');

    const formattedResult = result.records.map((record) => {
      const employee = record.get('p');
      return {
        id: employee.identity.low,
        properties: { ...employee.properties },
      };
    });

    return res.json(formattedResult);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const resultWithPersons = await session2.run(
      `MATCH (p:Person)-[rel:PARTICIPATE_IN]->(prj:Project)
       RETURN p, rel.role as role, prj`
    );

    const resultWithoutPersons = await session2.run(
      'MATCH (prj:Project) RETURN prj'
    );

    const projectsWithPersons = {};

    resultWithPersons.records.forEach((record) => {
      const person = record.get('p');
      const role = record.get('role');
      const project = record.get('prj');

      const projectDetails = projectsWithPersons[project.identity.low];

      if (!projectDetails) {
        projectsWithPersons[project.identity.low] = {
          id: project.identity.low,
          properties: { ...project.properties },
          persons: [],
        };
      }

      if (person) {
        projectsWithPersons[project.identity.low].persons.push({
          ...person.properties,
          role,
          id: person.identity.low,
        });
      }
    });

    resultWithoutPersons.records.forEach((record) => {
      const project = record.get('prj');

      const projectDetails = projectsWithPersons[project.identity.low];

      if (!projectDetails) {
        projectsWithPersons[project.identity.low] = {
          id: project.identity.low,
          properties: { ...project.properties },
          persons: [],
        };
      }
    });

    const formattedResult = Object.values(projectsWithPersons);

    return res.json(formattedResult);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ error: 'Name is required in the request body' });
    }

    const result = await session.run(
      'CREATE (p:Person {name: $name}) RETURN p',
      { name }
    );
    const createdPerson = result.records[0].get('p');

    return res.status(201).json({
      id: createdPerson.identity.low,
      properties: createdPerson.properties,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({
        error:
          'Title, description, and endDate are required in the request body',
      });
    }

    const result = await session.run(
      'CREATE (prj:Project {title: $title}) RETURN prj',
      { title }
    );

    const createdProject = result.records[0].get('prj');

    return res.status(201).json({
      id: createdProject.identity.low,
      properties: createdProject.properties,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/relationships', async (req, res) => {
  try {
    const { personName, role, projectTitle } = req.body;

    if (!personName || !role || !projectTitle) {
      return res.status(400).json({
        error:
          'Person name, role, and project title are required in the request body',
      });
    }

    const result = await session.run(
      'MATCH (p:Person {name: $personName}), (prj:Project {title: $projectTitle}) ' +
        'CREATE (p)-[:PARTICIPATE_IN {role: $role}]->(prj) RETURN p, prj',
      { personName, role, projectTitle }
    );

    const createdRelationship = result.records[0];

    if (!createdRelationship) {
      return res.status(404).json({ error: 'Person or project not found' });
    }

    const person = createdRelationship.get('p');
    const project = createdRelationship.get('prj');

    return res.status(201).json({
      person: {
        ...person.properties,
      },
      role: role,
      project: {
        ...project.properties,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const projectId = req.params.id;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const result = await session.run(
      'MATCH (prj:Project) WHERE id(prj) = $projectId DETACH DELETE prj',
      {
        projectId: parseInt(projectId, 10),
      }
    );

    if (result.summary.counters.nodesDeleted === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.status(204).end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const personId = req.params.id;

    if (!personId) {
      return res.status(400).json({ error: 'Person ID is required' });
    }

    const result = await session.run(
      'MATCH (p:Person) WHERE id(p) = $personId DETACH DELETE p',
      {
        personId: parseInt(personId, 10),
      }
    );

    if (result.summary.counters.nodesDeleted === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }

    return res.status(204).end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const personId = req.params.id;
    const name = req.body.editedName;

    if (!personId || !name) {
      return res
        .status(400)
        .json({ error: 'Both person ID and new name are required' });
    }

    const result = await session.run(
      'MATCH (p:Person) WHERE ID(p) = $personId SET p.name = $name RETURN p',
      { personId: parseInt(personId), name }
    );

    if (result.summary.counters.nodesUpdated === 0) {
      return res.status(404).json({ error: 'Person not found' });
    }

    return res.status(200).json({ message: 'Person updated successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const title = req.body.editedTitle;

    if (!projectId || !title) {
      return res.status(400).json({
        error: 'Project ID and new title are required',
      });
    }

    const result = await session.run(
      'MATCH (prj:Project) WHERE ID(prj) = $projectId SET prj.title = $title RETURN prj',
      { projectId: parseInt(projectId), title }
    );

    if (result.summary.counters.nodesUpdated === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.status(200).json({ message: 'Project updated successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/relationships/remove', async (req, res) => {
  try {
    const { personName, projectTitle } = req.body;

    if (!personName || !projectTitle) {
      return res.status(400).json({
        error: 'Person ID and project ID are required',
      });
    }

    const result = await session.run(
      'MATCH (p:Person {name: $personName})-[rel:PARTICIPATE_IN]->(prj:Project {title: $projectTitle}) ' +
        'DELETE rel',
      { personName, projectTitle }
    );

    if (result.summary.counters.relationshipsUpdated === 0) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    return res
      .status(200)
      .json({ message: 'Person removed from project successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Serwer działa na http://localhost:${port}`);
});
